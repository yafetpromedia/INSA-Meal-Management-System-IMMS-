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

  async list(user: AuthUser, query: { skip?: number; take?: number; action?: string }) {
    const where = {
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(query.action ? { action: query.action } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 200),
        include: { user: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
