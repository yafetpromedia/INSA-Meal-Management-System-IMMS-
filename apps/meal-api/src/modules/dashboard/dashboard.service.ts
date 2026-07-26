import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  resolveActiveOrganizationId,
  scopeCampusFilter,
  scopeOrganizationFilter,
} from '../auth/auth.types';
import { MealsService } from '../meals/meals.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meals: MealsService,
  ) {}

  async summary(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const studentWhere = {
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
    };

    const [totalStudents, mealStats, activeStaff, currentYear] = await Promise.all([
      this.prisma.student.count({ where: studentWhere }),
      this.meals.todayStats(user, orgId ?? undefined),
      this.prisma.user.count({
        where: {
          status: 'ACTIVE',
          roles: { some: { role: { name: { in: ['Mentor', 'FoodStaff'] } } } },
          ...(user.isSuperAdmin
            ? {}
            : {
                organizationAssignments: {
                  some: { organizationId: { in: user.organizationIds } },
                },
              }),
        },
      }),
      orgId
        ? this.prisma.academicYear.findFirst({
            where: { organizationId: orgId, isCurrent: true },
          })
        : null,
    ]);

    const currentMeal = orgId
      ? await this.meals.currentMeal(orgId, user.campusIds[0])
      : null;

    return {
      organizationId: orgId,
      totalStudents,
      breakfastServed: mealStats.breakfast,
      lunchServed: mealStats.lunch,
      dinnerServed: mealStats.dinner,
      mealsByCode: mealStats.byCode,
      mealsServedToday: mealStats.total,
      duplicateScanAttempts: mealStats.duplicateScanAttempts,
      activeStaff,
      currentCampusIds: user.campusIds,
      currentProgramIds: user.programIds,
      currentMealSession: currentMeal,
      currentAcademicYear: currentYear?.name ?? null,
    };
  }

  async activityFeed(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.prisma.auditLog.findMany({
      where: {
        action: { in: ['Meal.Serve', 'Meal.Override', 'Meal.SessionUpsert'] },
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
        ...(orgId ? { organizationId: orgId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: 20,
      include: { user: { select: { fullName: true } } },
    });
  }
}
