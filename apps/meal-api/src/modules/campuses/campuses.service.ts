import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  assertOrgAccess,
  resolveActiveOrganizationId,
  scopeOrganizationFilter,
} from '../auth/auth.types';

@Injectable()
export class CampusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, search?: string, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const where = {
      deletedAt: null,
      ...scopeOrganizationFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(user.isSuperAdmin ? {} : { id: { in: user.campusIds } }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { shortName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    return this.prisma.campus.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { organization: { select: { id: true, code: true, name: true } } },
    });
  }

  async get(user: AuthUser, id: string) {
    this.assertCampusAccess(user, id);
    const campus = await this.prisma.campus.findUnique({
      where: { id },
      include: { organization: true },
    });
    if (!campus) throw new NotFoundException('Campus not found');
    if (!assertOrgAccess(user, campus.organizationId)) {
      throw new NotFoundException('Campus not found');
    }
    return campus;
  }

  async create(
    user: AuthUser,
    data: {
      organizationId: string;
      name: string;
      shortName: string;
      address?: string;
      city?: string;
      location?: string;
      description?: string;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    const campus = await this.prisma.campus.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        shortName: data.shortName,
        address: data.address,
        city: data.city,
        location: data.location,
        description: data.description,
        createdById: user.id,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Campus.Create',
      resource: 'Campus',
      resourceId: campus.id,
      organizationId: campus.organizationId,
      campusId: campus.id,
      newValue: campus,
    });
    return campus;
  }

  async update(
    user: AuthUser,
    id: string,
    data: Partial<{
      name: string;
      shortName: string;
      address: string;
      city: string;
      location: string;
      description: string;
      logoUrl: string;
    }>,
  ) {
    await this.get(user, id);
    const campus = await this.prisma.campus.update({
      where: { id },
      data: {
        ...data,
        // City/address are the source of truth; clear duplicated freeform location unless set explicitly
        ...(data.location === undefined && (data.city !== undefined || data.address !== undefined)
          ? { location: null }
          : {}),
        updatedById: user.id,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Campus.Update',
      resource: 'Campus',
      resourceId: id,
      organizationId: campus.organizationId,
      campusId: id,
      newValue: campus,
    });
    return campus;
  }

  async setStatus(user: AuthUser, id: string, status: EntityStatus) {
    await this.get(user, id);
    return this.prisma.campus.update({ where: { id }, data: { status, updatedById: user.id } });
  }

  async remove(user: AuthUser, id: string) {
    const campus = await this.get(user, id);
    if (campus.deletedAt) {
      throw new BadRequestException('Campus already deleted');
    }
    const activeStudents = await this.prisma.student.count({
      where: { campusId: id, deletedAt: null },
    });
    if (activeStudents > 0) {
      throw new BadRequestException('Cannot delete campus with active students');
    }
    await this.prisma.campus.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: EntityStatus.DISABLED,
        updatedById: user.id,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Campus.Delete',
      resource: 'Campus',
      resourceId: id,
      organizationId: campus.organizationId,
      campusId: id,
    });
    return { success: true };
  }

  private assertCampusAccess(user: AuthUser, campusId: string) {
    if (user.isSuperAdmin) return;
    if (!user.campusIds.includes(campusId)) {
      throw new NotFoundException('Campus not found');
    }
  }
}
