import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser, scopeCampusFilter, scopeOrganizationFilter } from '../auth/auth.types';

type AuditInput = {
  userId?: string;
  roleName?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  previousValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  organizationId?: string;
  campusId?: string;
  programId?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput) {
    return this.prisma.auditLog.create({ data: input });
  }

  async list(
    user: AuthUser,
    query: {
      skip?: number;
      take?: number;
      page?: number;
      limit?: number;
      action?: string;
      userId?: string;
      resource?: string;
    },
  ) {
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? query.limit ?? 20, 200);
    const page = query.page ?? Math.floor(skip / take) + 1;
    const where = {
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.resource ? { resource: query.resource } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take,
        include: { user: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }
}
