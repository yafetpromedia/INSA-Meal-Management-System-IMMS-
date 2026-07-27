import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  assertOrgAccess,
  resolveActiveOrganizationId,
  scopeOrganizationFilter,
} from '../auth/auth.types';

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.prisma.academicYear.findMany({
      where: {
        deletedAt: null,
        ...scopeOrganizationFilter(user),
        ...(orgId ? { organizationId: orgId } : {}),
      },
      orderBy: { name: 'desc' },
    });
  }

  async create(
    user: AuthUser,
    data: {
      organizationId: string;
      name: string;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      isCurrent?: boolean;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    if (data.isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { organizationId: data.organizationId },
        data: { isCurrent: false },
      });
    }
    return this.prisma.academicYear.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        isActive: data.isActive ?? true,
        isCurrent: data.isCurrent ?? false,
      },
    });
  }

  async setCurrent(user: AuthUser, id: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
    if (!year || !assertOrgAccess(user, year.organizationId)) {
      throw new NotFoundException('Academic year not found');
    }
    await this.prisma.academicYear.updateMany({
      where: { organizationId: year.organizationId, deletedAt: null },
      data: { isCurrent: false },
    });
    return this.prisma.academicYear.update({ where: { id }, data: { isCurrent: true, isActive: true } });
  }

  async update(
    user: AuthUser,
    id: string,
    data: Partial<{ name: string; startDate: string; endDate: string; isActive: boolean }>,
  ) {
    const year = await this.prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
    if (!year || !assertOrgAccess(user, year.organizationId)) {
      throw new NotFoundException('Academic year not found');
    }
    return this.prisma.academicYear.update({
      where: { id },
      data: {
        name: data.name,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
  }

  async softDelete(user: AuthUser, id: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
    if (!year || !assertOrgAccess(user, year.organizationId)) {
      throw new NotFoundException('Academic year not found');
    }
    await this.prisma.academicYear.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isCurrent: false },
    });
    return { success: true };
  }
}
