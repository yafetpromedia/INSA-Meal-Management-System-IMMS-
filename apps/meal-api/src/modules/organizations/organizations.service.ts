import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, scopeOrganizationFilter } from '../auth/auth.types';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, search?: string) {
    return this.prisma.organization.findMany({
      where: {
        ...scopeOrganizationFilter(user),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { code: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        modules: { include: { module: true } },
        _count: { select: { campuses: true, programs: true, students: true } },
      },
    });
  }

  async get(user: AuthUser, id: string) {
    if (!user.isSuperAdmin && !user.organizationIds.includes(id)) {
      throw new NotFoundException('Organization not found');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        modules: { include: { module: true } },
        campuses: true,
        academicYears: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(
    user: AuthUser,
    data: {
      code: string;
      name: string;
      description?: string;
      timezone?: string;
      locale?: string;
    },
  ) {
    const org = await this.prisma.organization.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description,
        timezone: data.timezone ?? 'Africa/Addis_Ababa',
        locale: data.locale ?? 'en',
        createdById: user.id,
      },
    });

    const coreModules = await this.prisma.platformModule.findMany({
      where: { isCore: true },
    });
    if (coreModules.length) {
      await this.prisma.organizationModule.createMany({
        data: coreModules.map((m) => ({
          organizationId: org.id,
          moduleKey: m.key,
          isEnabled: true,
        })),
      });
    }

    await this.audit.log({
      userId: user.id,
      action: 'Organization.Create',
      resource: 'Organization',
      resourceId: org.id,
      organizationId: org.id,
      newValue: org,
    });

    return org;
  }

  async update(
    user: AuthUser,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      timezone: string;
      locale: string;
      branding: object;
      status: EntityStatus;
    }>,
  ) {
    await this.get(user, id);
    return this.prisma.organization.update({
      where: { id },
      data: { ...data, updatedById: user.id },
    });
  }

  async setModuleEnabled(
    user: AuthUser,
    organizationId: string,
    moduleKey: string,
    isEnabled: boolean,
    config?: object,
  ) {
    await this.get(user, organizationId);
    return this.prisma.organizationModule.upsert({
      where: {
        organizationId_moduleKey: { organizationId, moduleKey },
      },
      create: {
        organizationId,
        moduleKey,
        isEnabled,
        config: config ?? undefined,
      },
      update: { isEnabled, config: config ?? undefined },
    });
  }
}
