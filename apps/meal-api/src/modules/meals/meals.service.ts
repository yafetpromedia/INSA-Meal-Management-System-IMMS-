import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MealRecordStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  ORG_SCOPE,
  hasPermission,
  resolveActiveOrganizationId,
  scopeCampusFilter,
  scopeOrganizationFilter,
} from '../auth/auth.types';

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listConfigs(organizationId: string, campusId?: string) {
    const campusConfigs = campusId
      ? await this.prisma.mealSessionConfig.findMany({
          where: { organizationId, scopeKey: campusId, isActive: true },
          orderBy: { sortOrder: 'asc' },
        })
      : [];
    if (campusConfigs.length) return campusConfigs;

    return this.prisma.mealSessionConfig.findMany({
      where: { organizationId, scopeKey: ORG_SCOPE, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertSession(
    user: AuthUser,
    data: {
      organizationId: string;
      campusId?: string;
      code: string;
      name: string;
      startTime: string;
      endTime: string;
      gracePeriod?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const scopeKey = data.campusId ?? ORG_SCOPE;
    const session = await this.prisma.mealSessionConfig.upsert({
      where: {
        organizationId_scopeKey_code: {
          organizationId: data.organizationId,
          scopeKey,
          code: data.code.toUpperCase(),
        },
      },
      create: {
        organizationId: data.organizationId,
        campusId: data.campusId,
        scopeKey,
        code: data.code.toUpperCase(),
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        gracePeriod: data.gracePeriod ?? 0,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
      update: {
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        gracePeriod: data.gracePeriod ?? 0,
        sortOrder: data.sortOrder,
        isActive: data.isActive ?? true,
        campusId: data.campusId,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'Meal.SessionUpsert',
      resource: 'MealSessionConfig',
      resourceId: session.id,
      organizationId: data.organizationId,
      campusId: data.campusId,
      newValue: session,
    });

    return session;
  }

  async currentMeal(organizationId: string, campusId?: string): Promise<string | null> {
    const configs = await this.listConfigs(organizationId, campusId);
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();

    for (const config of configs) {
      if (this.isWithinWindow(minutes, config.startTime, config.endTime, config.gracePeriod)) {
        return config.code;
      }
    }
    return null;
  }

  async verifyAndServe(
    user: AuthUser,
    input: {
      barcode: string;
      organizationId?: string;
      override?: boolean;
      overrideReason?: string;
      scannerDevice?: string;
      location?: string;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, input.organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException('Organization context required');
    }

    const student = await this.prisma.student.findFirst({
      where: {
        barcode: input.barcode,
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
      },
      include: { campus: true, program: true },
    });
    if (!student) throw new NotFoundException('Student Not Found');
    if (!user.isSuperAdmin && !user.campusIds.includes(student.campusId)) {
      throw new NotFoundException('Student Not Found');
    }
    if (student.status !== StudentStatus.ACTIVE) {
      throw new BadRequestException('Student inactive');
    }

    const mealCode = await this.currentMeal(student.organizationId, student.campusId);
    if (!mealCode) {
      throw new BadRequestException('Meal session closed');
    }

    const now = new Date();
    const mealDate = new Date(now);
    mealDate.setHours(0, 0, 0, 0);
    const week = this.isoWeekNumber(now);
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });

    const existing = await this.prisma.mealRecord.findUnique({
      where: {
        studentId_mealDate_mealCode: {
          studentId: student.id,
          mealDate,
          mealCode,
        },
      },
    });

    // Any existing row for student+date+session blocks a second record (Rule 5).
    if (existing) {
      if (!input.override) {
        throw new ConflictException('Duplicate meal detected');
      }
      if (!hasPermission(user, 'Meal.Override')) {
        throw new BadRequestException('Override not permitted');
      }
      if (!input.overrideReason) {
        throw new BadRequestException('Override requires a reason');
      }

      const updated = await this.prisma.mealRecord.update({
        where: { id: existing.id },
        data: {
          status: MealRecordStatus.OVERRIDDEN,
          overrideReason: input.overrideReason,
          approvedById: user.id,
          approvedAt: new Date(),
          mentorId: user.id,
          notes: input.overrideReason,
          week,
          day,
        },
      });
      await this.audit.log({
        userId: user.id,
        action: 'Meal.Override',
        resource: 'MealRecord',
        resourceId: updated.id,
        organizationId: student.organizationId,
        campusId: student.campusId,
        programId: student.programId,
        previousValue: existing,
        newValue: updated,
      });
      return { student, meal: updated, mealCode, duplicatePrevented: false, overridden: true };
    }

    try {
      const meal = await this.prisma.mealRecord.create({
        data: {
          organizationId: student.organizationId,
          studentId: student.id,
          campusId: student.campusId,
          programId: student.programId,
          academicYearId: student.academicYearId,
          mealDate,
          mealCode,
          week,
          day,
          mentorId: user.id,
          scannerDevice: input.scannerDevice,
          location: input.location,
          status: MealRecordStatus.SERVED,
          createdById: user.id,
        },
      });

      await this.audit.log({
        userId: user.id,
        action: 'Meal.Serve',
        resource: 'MealRecord',
        resourceId: meal.id,
        organizationId: student.organizationId,
        campusId: student.campusId,
        programId: student.programId,
        newValue: meal,
      });

      return { student, meal, mealCode, duplicatePrevented: false, overridden: false };
    } catch (err) {
      // Race / timezone edge: unique index is the final duplicate guard
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Duplicate meal detected');
      }
      throw err;
    }
  }

  async history(
    user: AuthUser,
    query: {
      organizationId?: string;
      campusId?: string;
      studentId?: string;
      mealCode?: string;
      skip?: number;
      take?: number;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    const where = {
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(query.campusId ? { campusId: query.campusId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.mealCode ? { mealCode: query.mealCode } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.mealRecord.findMany({
        where,
        include: {
          student: { select: { id: true, studentId: true, fullName: true, barcode: true } },
          campus: { select: { id: true, shortName: true, name: true } },
          program: { select: { id: true, name: true } },
          mentor: { select: { id: true, fullName: true } },
        },
        orderBy: { servedAt: 'desc' },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 200),
      }),
      this.prisma.mealRecord.count({ where }),
    ]);
    return { items, total };
  }

  async todayStats(user: AuthUser, organizationId?: string) {
    const mealDate = new Date();
    mealDate.setHours(0, 0, 0, 0);
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const where = {
      mealDate,
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
    };

    const grouped = await this.prisma.mealRecord.groupBy({
      by: ['mealCode'],
      where,
      _count: { _all: true },
    });

    const byCode = Object.fromEntries(grouped.map((g) => [g.mealCode, g._count._all]));
    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
    const duplicates = await this.prisma.auditLog.count({
      where: {
        action: 'Meal.DuplicatePrevented',
        timestamp: { gte: mealDate },
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
      },
    });

    return {
      byCode,
      breakfast: byCode.BREAKFAST ?? 0,
      lunch: byCode.LUNCH ?? 0,
      dinner: byCode.DINNER ?? 0,
      total,
      duplicateScanAttempts: duplicates,
    };
  }

  private isoWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  private toMinutes(hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private isWithinWindow(nowMinutes: number, startTime: string, endTime: string, gracePeriod: number) {
    const start = this.toMinutes(startTime);
    let end = this.toMinutes(endTime) + gracePeriod;
    // Support overnight windows (e.g. 22:00–02:00)
    if (end < start) {
      return nowMinutes >= start || nowMinutes <= end;
    }
    return nowMinutes >= start && nowMinutes <= end;
  }
}
