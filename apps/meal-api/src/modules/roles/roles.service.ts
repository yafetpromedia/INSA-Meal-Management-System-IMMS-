import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ORG_SCOPE, PLATFORM_SCOPE } from '../auth/auth.types';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles(organizationId?: string) {
    return this.prisma.role.findMany({
      where: organizationId
        ? { OR: [{ scopeKey: PLATFORM_SCOPE }, { scopeKey: organizationId }] }
        : undefined,
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }

  async createCustomRole(data: {
    name: string;
    displayName: string;
    description?: string;
    permissionKeys: string[];
    organizationId: string;
  }) {
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: data.permissionKeys } },
    });
    return this.prisma.role.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        isSystem: false,
        organizationId: data.organizationId,
        scopeKey: data.organizationId || ORG_SCOPE,
        permissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }
}
