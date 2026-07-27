import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  resolveActiveOrganizationId,
  scopeCampusFilter,
  scopeOrganizationFilter,
} from '../auth/auth.types';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private baseWhere(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return {
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
    };
  }

  async mealsReport(user: AuthUser, organizationId?: string) {
    const items = await this.prisma.mealRecord.findMany({
      where: this.baseWhere(user, organizationId),
      include: { student: true, campus: true, program: true },
      orderBy: { servedAt: 'desc' },
      take: 500,
    });
    return {
      format: 'json-stub',
      message: 'PDF/Excel/CSV export will be implemented in a later phase',
      count: items.length,
      items,
    };
  }

  async periodReport(
    user: AuthUser,
    period: 'daily' | 'weekly' | 'monthly',
    organizationId?: string,
  ) {
    const now = new Date();
    const from = new Date(now);
    if (period === 'daily') {
      from.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
      from.setDate(from.getDate() - 7);
    } else {
      from.setMonth(from.getMonth() - 1);
    }

    const where = {
      ...this.baseWhere(user, organizationId),
      servedAt: { gte: from },
    };

    const grouped = await this.prisma.mealRecord.groupBy({
      by: ['mealCode'],
      where,
      _count: { _all: true },
    });

    return {
      period,
      from,
      to: now,
      bySession: Object.fromEntries(grouped.map((g) => [g.mealCode, g._count._all])),
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
    };
  }

  async groupReport(
    user: AuthUser,
    groupBy: 'campus' | 'mentor',
    organizationId?: string,
  ) {
    const where = this.baseWhere(user, organizationId);
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
        items: grouped.map((g) => ({
          campus: map[g.campusId],
          count: g._count._all,
        })),
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
      select: { id: true, fullName: true, email: true },
    });
    const map = Object.fromEntries(mentors.map((m) => [m.id, m]));
    return {
      groupBy,
      items: grouped.map((g) => ({
        mentor: g.mentorId ? map[g.mentorId] : null,
        count: g._count._all,
      })),
    };
  }
}
