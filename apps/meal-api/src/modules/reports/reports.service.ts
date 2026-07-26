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

  async mealsReport(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const items = await this.prisma.mealRecord.findMany({
      where: {
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
        ...(orgId ? { organizationId: orgId } : {}),
      },
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
}
