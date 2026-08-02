import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import {
  DisciplinaryActionStatus,
  IncidentStatus,
  MealRecordStatus,
  StudentStatus,
} from '@prisma/client';
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
  assertOrgAccess,
  hasPermission,
  resolveActiveOrganizationId,
  resolveCampusId,
  scopeCampusFilter,
  scopeOrganizationFilter,
} from '../auth/auth.types';
import { LeaveService } from '../leave/leave.service';

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => LeaveService))
    private readonly leaveService: LeaveService,
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
    if (!assertOrgAccess(user, existing.organizationId)) {
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
    if (!assertOrgAccess(user, existing.organizationId)) {
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
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }
    if (data.campusId) {
      const campusFilter = resolveCampusId(user, data.campusId);
      if (campusFilter === undefined && !user.isSuperAdmin) {
        throw new ForbiddenException('Campus not in your scope');
      }
    }
    const scopeKey = data.campusId ?? ORG_SCOPE;
    const existing = await this.prisma.mealSessionConfig.findUnique({
      where: {
        organizationId_scopeKey_code: {
          organizationId: data.organizationId,
          scopeKey,
          code: data.code.toUpperCase(),
        },
      },
    });
    if (existing?.deletedAt) {
      throw new BadRequestException('Session was deleted. Create a new code or restore via admin.');
    }
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
      throw new BadRequestException(
        'Organization context required. Sign out and sign in again.',
      );
    }
    if (!input.barcode && !input.studentId) {
      throw new BadRequestException('barcode or studentId is required');
    }
    if (!user.isSuperAdmin && user.campusIds.length === 0) {
      throw new ForbiddenException(
        'No campus assigned to your account. Ask an admin to assign your campus, then sign in again.',
      );
    }

    const orgScope = {
      deletedAt: null as null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
    };
    const scope = {
      ...orgScope,
      ...scopeCampusFilter(user),
    };

    const include = { campus: true, program: true } as const;

    // Internal DB id (serve after verify often sends barcode, but studentId may be cuid)
    if (input.studentId && !input.barcode) {
      const byPk = await this.prisma.student.findFirst({
        where: { ...scope, id: input.studentId },
        include,
      });
      if (byPk) return byPk;

      const outsidePk = await this.prisma.student.findFirst({
        where: { ...orgScope, id: input.studentId },
        select: { studentId: true },
      });
      if (outsidePk) {
        throw new ForbiddenException(
          `Student ${outsidePk.studentId} is outside your campus. Ask an admin to update your campus access.`,
        );
      }
    }

    const key = (input.barcode ?? input.studentId ?? '').trim();
    if (!key) throw new BadRequestException('barcode or studentId is required');

    // Exact studentId or barcode (full CTC-1900-26), case-insensitive
    let student = await this.prisma.student.findFirst({
      where: {
        ...scope,
        OR: [
          { barcode: { equals: key, mode: 'insensitive' } },
          { studentId: { equals: key, mode: 'insensitive' } },
        ],
      },
      include,
    });

    // Short form: type 1900 to match CTC-1900-26 (segment between dashes) — within campus
    if (!student) {
      const short = key.replace(/^#+/, '');
      const looksShort =
        short.length >= 3 &&
        short.length <= 12 &&
        !short.includes('-') &&
        /^[A-Za-z0-9]+$/.test(short);

      if (looksShort) {
        const candidates = await this.prisma.student.findMany({
          where: {
            ...scope,
            OR: [
              { studentId: { contains: `-${short}-`, mode: 'insensitive' } },
              { barcode: { contains: `-${short}-`, mode: 'insensitive' } },
              { studentId: { endsWith: `-${short}`, mode: 'insensitive' } },
              { barcode: { endsWith: `-${short}`, mode: 'insensitive' } },
              { studentId: { startsWith: `${short}-`, mode: 'insensitive' } },
              { barcode: { startsWith: `${short}-`, mode: 'insensitive' } },
            ],
          },
          include,
          take: 6,
        });

        if (candidates.length === 1) {
          student = candidates[0];
        } else if (candidates.length > 1) {
          const samples = candidates
            .slice(0, 3)
            .map((c) => c.studentId)
            .join(', ');
          throw new BadRequestException(
            `Multiple students match "${short}" (${samples}). Use the full ID.`,
          );
        }
      }
    }

    if (!student) {
      // Exists in org but outside mentor campus?
      const outside = await this.prisma.student.findFirst({
        where: {
          ...orgScope,
          OR: [
            { barcode: { equals: key, mode: 'insensitive' } },
            { studentId: { equals: key, mode: 'insensitive' } },
          ],
        },
        select: { studentId: true, campus: { select: { shortName: true, name: true } } },
      });
      if (outside) {
        const campusLabel =
          outside.campus?.shortName || outside.campus?.name || 'another campus';
        throw new ForbiddenException(
          `Student ${outside.studentId} belongs to ${campusLabel}, which is outside your campus access.`,
        );
      }
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

    const outsideLeave = await this.leaveService.findActiveOutsideLeave(student.id);
    if (outsideLeave) {
      return {
        eligible: false,
        reason: `Approved leave (${outsideLeave.leaveNumber})`,
        student,
        mealSession: null,
        leaveRequestId: outsideLeave.id,
      };
    }

    const disciplinaryAlert = await this.disciplinaryMealAlert(student.id, student.organizationId);
    if (disciplinaryAlert.mealRestrictionActive) {
      return {
        eligible: false,
        reason: 'Active meal restriction (disciplinary)',
        student,
        mealSession: null,
        disciplinaryAlert,
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
      disciplinaryAlert,
    };
  }

  private async disciplinaryMealAlert(studentId: string, organizationId: string) {
    const openStatuses: IncidentStatus[] = [
      IncidentStatus.OPEN,
      IncidentStatus.UNDER_INVESTIGATION,
      IncidentStatus.AWAITING_DECISION,
      IncidentStatus.ACTION_ASSIGNED,
      IncidentStatus.APPEALED,
    ];
    const openCases = await this.prisma.disciplinaryIncident.count({
      where: {
        studentId,
        deletedAt: null,
        status: { in: openStatuses },
      },
    });
    const mealRestricted = await this.prisma.disciplinaryAction.count({
      where: {
        organizationId,
        status: {
          in: [DisciplinaryActionStatus.PENDING, DisciplinaryActionStatus.ACTIVE],
        },
        actionType: { affectsMeals: true, deletedAt: null },
        incident: {
          studentId,
          deletedAt: null,
          status: { in: openStatuses },
        },
      },
    });
    return {
      hasOpenCase: openCases > 0,
      openCases,
      mealRestrictionActive: mealRestricted > 0,
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

    const outsideLeave = await this.leaveService.findActiveOutsideLeave(student.id);
    if (outsideLeave) {
      throw new BadRequestException(
        `Approved leave (${outsideLeave.leaveNumber})`,
      );
    }

    const openMeal = await this.currentMeal(student.organizationId, student.campusId);
    let mealCode = openMeal;

    // Client-supplied session only with Meal.Override (+ reason); otherwise use open window
    if (input.mealCode || input.mealSessionId) {
      const requested = input.mealCode?.toUpperCase();
      if (input.mealSessionId) {
        const session = await this.prisma.mealSessionConfig.findFirst({
          where: {
            id: input.mealSessionId,
            organizationId: student.organizationId,
            deletedAt: null,
          },
        });
        if (!session) throw new BadRequestException('Meal session not found');
        if (session.code !== openMeal) {
          if (!input.override || !hasPermission(user, 'Meal.Override')) {
            throw new BadRequestException('Meal session closed');
          }
          if (!input.overrideReason) {
            throw new BadRequestException('Override requires a reason');
          }
        }
        mealCode = session.code;
      } else if (requested && requested !== openMeal) {
        if (!input.override || !hasPermission(user, 'Meal.Override')) {
          throw new BadRequestException('Meal session closed');
        }
        if (!input.overrideReason) {
          throw new BadRequestException('Override requires a reason');
        }
        mealCode = requested;
      } else if (requested) {
        mealCode = requested;
      }
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
    const campusFilter = resolveCampusId(user, query.campusId);
    if (query.campusId && campusFilter === undefined && !user.isSuperAdmin) {
      return { items: [], total: 0, page: 1, limit: Math.min(query.take ?? query.limit ?? 20, 200) };
    }
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? query.limit ?? 20, 200);
    const page = query.page ?? Math.floor(skip / take) + 1;
    const where = {
      ...scopeOrganizationFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(campusFilter !== undefined ? { campusId: campusFilter } : {}),
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
   * `studentKey` accepts internal id, full studentId/barcode (CTC-1900-26), or short number (1900).
   */
  async studentProfile(user: AuthUser, studentKey: string, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const scope = {
      deletedAt: null as null,
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
    };

    let student = await this.prisma.student.findFirst({
      where: {
        ...scope,
        OR: [{ id: studentKey }, { studentId: studentKey }, { barcode: studentKey }],
      },
      include: {
        campus: true,
        program: true,
        academicYear: true,
      },
    });

    if (!student) {
      const short = studentKey.trim();
      const looksShort =
        short.length >= 3 &&
        short.length <= 12 &&
        !short.includes('-') &&
        /^[A-Za-z0-9]+$/.test(short);
      if (looksShort) {
        const candidates = await this.prisma.student.findMany({
          where: {
            ...scope,
            OR: [
              { studentId: { contains: `-${short}-`, mode: 'insensitive' } },
              { barcode: { contains: `-${short}-`, mode: 'insensitive' } },
            ],
          },
          include: { campus: true, program: true, academicYear: true },
          take: 6,
        });
        if (candidates.length === 1) student = candidates[0];
        else if (candidates.length > 1) {
          throw new BadRequestException(
            `Multiple students match "${short}". Use the full ID (e.g. CTC-1900-26).`,
          );
        }
      }
    }

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
