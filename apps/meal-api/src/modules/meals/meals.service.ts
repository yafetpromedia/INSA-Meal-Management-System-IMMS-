import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MealRecordStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ethiopiaCalendarDate,
  ethiopiaDayStartUtc,
  ethiopiaMinutesNow,
  ethiopiaWeekday,
} from '../../common/timezone';
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
          where: { organizationId, scopeKey: campusId, isActive: true, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        })
      : [];
    if (campusConfigs.length) return campusConfigs;

    return this.prisma.mealSessionConfig.findMany({
      where: { organizationId, scopeKey: ORG_SCOPE, isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateSessionById(
    user: AuthUser,
    id: string,
    data: Partial<{
      name: string;
      startTime: string;
      endTime: string;
      gracePeriod: number;
      isActive: boolean;
      sortOrder: number;
    }>,
  ) {
    const existing = await this.prisma.mealSessionConfig.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Meal session not found');
    }
    const session = await this.prisma.mealSessionConfig.update({
      where: { id },
      data,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Meal.SessionUpdate',
      resource: 'MealSessionConfig',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId ?? undefined,
      previousValue: existing,
      newValue: session,
    });
    return session;
  }

  async softDeleteSession(user: AuthUser, id: string) {
    const existing = await this.prisma.mealSessionConfig.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Meal session not found');
    }
    await this.prisma.mealSessionConfig.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Meal.SessionDelete',
      resource: 'MealSessionConfig',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId ?? undefined,
      previousValue: existing,
    });
    return { success: true };
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
        deletedAt: null,
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
    const minutes = ethiopiaMinutesNow();

    for (const config of configs) {
      if (this.isWithinWindow(minutes, config.startTime, config.endTime, config.gracePeriod)) {
        return config.code;
      }
    }
    return null;
  }

  private async resolveStudentForMeal(
    user: AuthUser,
    input: { barcode?: string; studentId?: string; organizationId?: string },
  ) {
    const orgId = resolveActiveOrganizationId(user, input.organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException('Organization context required');
    }
    if (!input.barcode && !input.studentId) {
      throw new BadRequestException('barcode or studentId is required');
    }

    const student = await this.prisma.student.findFirst({
      where: {
        deletedAt: null,
        ...(input.barcode ? { barcode: input.barcode } : {}),
        ...(input.studentId ? { id: input.studentId } : {}),
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
      },
      include: { campus: true, program: true },
    });
    if (!student) throw new NotFoundException('Student Not Found');
    if (!user.isSuperAdmin && !user.campusIds.includes(student.campusId)) {
      throw new NotFoundException('Student Not Found');
    }
    return student;
  }

  async verifyEligibility(
    user: AuthUser,
    input: { barcode?: string; studentId?: string; organizationId?: string },
  ) {
    const student = await this.resolveStudentForMeal(user, input);
    if (student.status !== StudentStatus.ACTIVE) {
      return {
        eligible: false,
        reason: 'Student inactive',
        student,
        mealSession: null,
      };
    }

    const mealCode = await this.currentMeal(student.organizationId, student.campusId);
    if (!mealCode) {
      return {
        eligible: false,
        reason: 'Meal session closed',
        student,
        mealSession: null,
      };
    }

    const mealDate = ethiopiaCalendarDate();
    const existing = await this.prisma.mealRecord.findUnique({
      where: {
        studentId_mealDate_mealCode: {
          studentId: student.id,
          mealDate,
          mealCode,
        },
      },
    });

    const session = await this.prisma.mealSessionConfig.findFirst({
      where: {
        organizationId: student.organizationId,
        code: mealCode,
        deletedAt: null,
        isActive: true,
      },
    });

    if (existing) {
      return {
        eligible: false,
        reason: 'Duplicate meal detected',
        student,
        mealSession: session?.name ?? mealCode,
        mealCode,
      };
    }

    return {
      eligible: true,
      student,
      mealSession: session?.name ?? mealCode,
      mealCode,
    };
  }

  async verifyAndServe(
    user: AuthUser,
    input: {
      barcode?: string;
      studentId?: string;
      mealCode?: string;
      mealSessionId?: string;
      organizationId?: string;
      override?: boolean;
      overrideReason?: string;
      scannerDevice?: string;
      location?: string;
    },
  ) {
    const student = await this.resolveStudentForMeal(user, input);
    if (student.status !== StudentStatus.ACTIVE) {
      throw new BadRequestException('Student inactive');
    }

    let mealCode =
      input.mealCode?.toUpperCase() ??
      (await this.currentMeal(student.organizationId, student.campusId));

    if (input.mealSessionId) {
      const session = await this.prisma.mealSessionConfig.findFirst({
        where: {
          id: input.mealSessionId,
          organizationId: student.organizationId,
          deletedAt: null,
        },
      });
      if (!session) throw new BadRequestException('Meal session not found');
      mealCode = session.code;
    }

    if (!mealCode) {
      throw new BadRequestException('Meal session closed');
    }

    const mealDate = ethiopiaCalendarDate();
    const weekNumber = this.isoWeekNumber(mealDate);
    const dayOfWeek = ethiopiaWeekday();

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
          weekNumber,
          dayOfWeek,
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
          weekNumber,
          dayOfWeek,
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
      page?: number;
      limit?: number;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? query.limit ?? 20, 200);
    const page = query.page ?? Math.floor(skip / take) + 1;
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
        skip,
        take,
      }),
      this.prisma.mealRecord.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  /**
   * Per-student meal profile: totals, days, weeks, sessions, and full timeline.
   * `studentKey` accepts internal id, studentId (e.g. CTC-…), or barcode.
   */
  async studentProfile(user: AuthUser, studentKey: string, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const student = await this.prisma.student.findFirst({
      where: {
        deletedAt: null,
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
        ...(orgId ? { organizationId: orgId } : {}),
        OR: [{ id: studentKey }, { studentId: studentKey }, { barcode: studentKey }],
      },
      include: {
        campus: true,
        program: true,
        academicYear: true,
      },
    });
    if (!student) throw new NotFoundException('Student Not Found');

    const meals = await this.prisma.mealRecord.findMany({
      where: {
        studentId: student.id,
        ...scopeOrganizationFilter(user),
        status: { in: [MealRecordStatus.SERVED, MealRecordStatus.OVERRIDDEN] },
      },
      include: {
        mentor: { select: { id: true, fullName: true } },
        campus: { select: { shortName: true, name: true } },
      },
      orderBy: { servedAt: 'desc' },
      take: 500,
    });

    const uniqueDays = new Set<string>();
    const uniqueWeeks = new Set<string>();
    const bySession: Record<string, number> = {};
    const byWeekday: Record<string, number> = {};
    const byWeekMap = new Map<
      string,
      { weekNumber: number; year: number; count: number; days: Set<string> }
    >();

    for (const m of meals) {
      const dayKey = m.mealDate.toISOString().slice(0, 10);
      uniqueDays.add(dayKey);

      const year = m.mealDate.getUTCFullYear();
      const weekNum = m.weekNumber ?? 0;
      const weekKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
      uniqueWeeks.add(weekKey);

      const code = (m.mealCode || 'UNKNOWN').toUpperCase();
      bySession[code] = (bySession[code] ?? 0) + 1;

      const weekday = m.dayOfWeek || 'Unknown';
      byWeekday[weekday] = (byWeekday[weekday] ?? 0) + 1;

      const weekEntry = byWeekMap.get(weekKey) ?? {
        weekNumber: weekNum,
        year,
        count: 0,
        days: new Set<string>(),
      };
      weekEntry.count += 1;
      weekEntry.days.add(dayKey);
      byWeekMap.set(weekKey, weekEntry);
    }

    const byWeek = [...byWeekMap.entries()]
      .map(([key, v]) => ({
        key,
        weekNumber: v.weekNumber,
        year: v.year,
        meals: v.count,
        daysEaten: v.days.size,
      }))
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.weekNumber - a.weekNumber));

    const firstMeal = meals.length ? meals[meals.length - 1]!.servedAt : null;
    const lastMeal = meals.length ? meals[0]!.servedAt : null;

    return {
      student: {
        id: student.id,
        studentId: student.studentId,
        barcode: student.barcode,
        fullName: student.fullName,
        department: student.department,
        status: student.status,
        campus: student.campus
          ? { id: student.campus.id, shortName: student.campus.shortName, name: student.campus.name }
          : null,
        program: student.program ? { id: student.program.id, name: student.program.name } : null,
        academicYear: student.academicYear
          ? { id: student.academicYear.id, name: student.academicYear.name }
          : null,
      },
      summary: {
        totalMeals: meals.length,
        daysEaten: uniqueDays.size,
        weeksActive: uniqueWeeks.size,
        bySession,
        byWeekday,
        firstMealAt: firstMeal,
        lastMealAt: lastMeal,
      },
      byWeek,
      meals: meals.map((m) => ({
        id: m.id,
        mealCode: m.mealCode,
        mealDate: m.mealDate,
        servedAt: m.servedAt,
        weekNumber: m.weekNumber,
        dayOfWeek: m.dayOfWeek,
        status: m.status,
        location: m.location,
        mentor: m.mentor,
        campus: m.campus,
      })),
    };
  }

  async todayStats(user: AuthUser, organizationId?: string) {
    const mealDate = ethiopiaCalendarDate();
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
        timestamp: { gte: ethiopiaDayStartUtc() },
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
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
