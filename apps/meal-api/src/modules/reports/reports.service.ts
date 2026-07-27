import { Injectable } from '@nestjs/common';
import { ethiopiaCalendarDate, ethiopiaDayStartUtc } from '../../common/timezone';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  resolveActiveOrganizationId,
  resolveCampusId,
  resolveProgramId,
  scopeOrganizationFilter,
} from '../auth/auth.types';

export type ReportFilters = {
  organizationId?: string;
  campusId?: string;
  programId?: string;
  mealCode?: string;
  /** Ethiopia calendar day YYYY-MM-DD */
  from?: string;
  /** Ethiopia calendar day YYYY-MM-DD (inclusive) */
  to?: string;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDayStart(dateStr?: string): Date | null {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - 3 * 60 * 60 * 1000);
  }

  /** Exclusive end = start of the day after `to`. */
  private parseDayEndExclusive(dateStr?: string): Date | null {
    const start = this.parseDayStart(dateStr);
    if (!start) return null;
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return end;
  }

  private reportWhere(user: AuthUser, filters: ReportFilters = {}) {
    const orgId = resolveActiveOrganizationId(user, filters.organizationId);
    if (filters.organizationId && !orgId) {
      return { id: '__none__' }; // force empty result for unauthorized org
    }
    const campusFilter = resolveCampusId(user, filters.campusId);
    const programFilter = resolveProgramId(user, filters.programId);
    if (filters.campusId && campusFilter === undefined && !user.isSuperAdmin) {
      return { id: '__none__' };
    }
    if (filters.programId && programFilter === undefined && !user.isSuperAdmin) {
      return { id: '__none__' };
    }
    const from = this.parseDayStart(filters.from);
    const toExcl = this.parseDayEndExclusive(filters.to);

    const servedAt =
      from || toExcl
        ? {
            ...(from ? { gte: from } : {}),
            ...(toExcl ? { lt: toExcl } : {}),
          }
        : undefined;

    return {
      ...scopeOrganizationFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(campusFilter !== undefined ? { campusId: campusFilter } : {}),
      ...(programFilter !== undefined ? { programId: programFilter } : {}),
      ...(filters.mealCode ? { mealCode: filters.mealCode } : {}),
      ...(servedAt ? { servedAt } : {}),
    };
  }

  private periodFrom(period: 'daily' | 'weekly' | 'monthly', now = new Date()) {
    const from = ethiopiaDayStartUtc(now);
    if (period === 'weekly') {
      from.setUTCDate(from.getUTCDate() - 6);
    } else if (period === 'monthly') {
      from.setUTCDate(from.getUTCDate() - 29);
    }
    return from;
  }

  async mealsReport(user: AuthUser, filters: ReportFilters = {}) {
    const items = await this.prisma.mealRecord.findMany({
      where: this.reportWhere(user, filters),
      include: {
        student: { select: { studentId: true, fullName: true, barcode: true } },
        campus: { select: { name: true, shortName: true } },
        program: { select: { name: true } },
      },
      orderBy: { servedAt: 'desc' },
      take: 500,
    });
    return {
      format: 'json',
      count: items.length,
      items: items.map((m) => ({
        id: m.id,
        mealCode: m.mealCode,
        servedAt: m.servedAt,
        mealDate: m.mealDate,
        studentId: m.student.studentId,
        studentName: m.student.fullName,
        barcode: m.student.barcode,
        campus: m.campus.shortName ?? m.campus.name,
        program: m.program?.name ?? null,
      })),
    };
  }

  async periodReport(
    user: AuthUser,
    period: 'daily' | 'weekly' | 'monthly',
    filters: ReportFilters = {},
  ) {
    const now = new Date();
    // Custom date range overrides the preset window
    const customFrom = this.parseDayStart(filters.from);
    const customTo = this.parseDayEndExclusive(filters.to);
    const from = customFrom ?? this.periodFrom(period, now);
    const toBound = customTo ?? now;

    const { from: _f, to: _t, ...rest } = filters;
    const where = {
      ...this.reportWhere(user, rest),
      servedAt: {
        gte: from,
        ...(customTo ? { lt: customTo } : { lte: toBound }),
      },
    };

    const grouped = await this.prisma.mealRecord.groupBy({
      by: ['mealCode'],
      where,
      _count: { _all: true },
    });

    return {
      period: customFrom || customTo ? 'custom' : period,
      from,
      to: customTo ? new Date(customTo.getTime() - 1) : now,
      bySession: Object.fromEntries(grouped.map((g) => [g.mealCode, g._count._all])),
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
    };
  }

  /** Last N Ethiopia calendar days, including today (unless custom from/to). */
  async trend(user: AuthUser, filters: ReportFilters = {}, days = 7) {
    const safeDays = Math.min(31, Math.max(1, days));
    const now = new Date();
    const customFrom = this.parseDayStart(filters.from);
    const customToExcl = this.parseDayEndExclusive(filters.to);

    let from: Date;
    let dayCount: number;

    if (customFrom && customToExcl) {
      from = customFrom;
      dayCount = Math.max(
        1,
        Math.min(31, Math.round((customToExcl.getTime() - customFrom.getTime()) / (24 * 60 * 60 * 1000))),
      );
    } else if (customFrom) {
      from = customFrom;
      const todayStart = ethiopiaDayStartUtc(now);
      dayCount = Math.max(
        1,
        Math.min(31, Math.round((todayStart.getTime() - customFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1),
      );
    } else {
      const todayStart = ethiopiaDayStartUtc(now);
      from = new Date(todayStart);
      from.setUTCDate(from.getUTCDate() - (safeDays - 1));
      dayCount = safeDays;
    }

    const { from: _f, to: _t, ...rest } = filters;
    const toExcl =
      customToExcl ??
      (() => {
        const end = new Date(from);
        end.setUTCDate(end.getUTCDate() + dayCount);
        return end;
      })();

    const records = await this.prisma.mealRecord.findMany({
      where: {
        ...this.reportWhere(user, rest),
        servedAt: { gte: from, lt: toExcl },
      },
      select: { servedAt: true, mealCode: true },
    });

    const counts = new Map<string, number>();
    for (const r of records) {
      const key = ethiopiaCalendarDate(r.servedAt).toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const points: { date: string; label: string; total: number }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(from);
      d.setUTCDate(from.getUTCDate() + i);
      const cal = ethiopiaCalendarDate(d);
      const key = cal.toISOString().slice(0, 10);
      const label = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Addis_Ababa',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(d);
      points.push({ date: key, label, total: counts.get(key) ?? 0 });
    }

    return {
      days: dayCount,
      from,
      to: now,
      points,
      total: points.reduce((sum, p) => sum + p.total, 0),
    };
  }

  async groupReport(
    user: AuthUser,
    groupBy: 'campus' | 'mentor',
    filters: ReportFilters = {},
  ) {
    const where = this.reportWhere(user, filters);
    if (groupBy === 'campus') {
      const grouped = await this.prisma.mealRecord.groupBy({
        by: ['campusId'],
        where,
        _count: { _all: true },
      });
      const campuses = await this.prisma.campus.findMany({
        where: { id: { in: grouped.map((g) => g.campusId) } },
        select: { id: true, name: true, shortName: true },
      });
      const map = Object.fromEntries(campuses.map((c) => [c.id, c]));
      return {
        groupBy,
        items: grouped
          .map((g) => ({
            campus: map[g.campusId],
            count: g._count._all,
          }))
          .sort((a, b) => b.count - a.count),
      };
    }

    const grouped = await this.prisma.mealRecord.groupBy({
      by: ['mentorId'],
      where: { ...where, mentorId: { not: null } },
      _count: { _all: true },
    });
    const mentorIds = grouped.map((g) => g.mentorId).filter((id): id is string => !!id);
    const mentors = await this.prisma.user.findMany({
      where: { id: { in: mentorIds } },
      select: { id: true, fullName: true, email: true, username: true },
    });
    const map = Object.fromEntries(mentors.map((m) => [m.id, m]));
    return {
      groupBy,
      items: grouped
        .map((g) => ({
          mentor: g.mentorId ? map[g.mentorId] : null,
          count: g._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
