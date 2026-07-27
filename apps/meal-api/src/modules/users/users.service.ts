import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../../common/utils/password.util';
import {
  isValidUsername,
  normalizeUsername,
  USERNAME_POLICY_MESSAGE,
} from '../../common/utils/username.util';
import { AuditService } from '../audit/audit.service';
import { AuthUser, PLATFORM_SCOPE, assertOrgAccess } from '../auth/auth.types';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.user.findMany({
      where: user.isSuperAdmin
        ? { deletedAt: null }
        : {
            deletedAt: null,
            organizationAssignments: {
              some: { organizationId: { in: user.organizationIds } },
            },
          },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        roles: { include: { role: true } },
        organizationAssignments: true,
        campusAssignments: true,
        programAssignments: true,
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(
    actor: AuthUser,
    data: {
      username: string;
      email?: string;
      fullName: string;
      password: string;
      phone?: string;
      roleNames: string[];
      organizationIds?: string[];
      campusIds?: string[];
      programIds?: string[];
    },
  ) {
    if (!isStrongPassword(data.password)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }
    if (!isValidUsername(data.username)) {
      throw new BadRequestException(USERNAME_POLICY_MESSAGE);
    }
    if (data.roleNames.includes('SuperAdmin') && !actor.isSuperAdmin) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }

    for (const orgId of data.organizationIds ?? []) {
      if (!assertOrgAccess(actor, orgId)) {
        throw new ForbiddenException('Cannot assign organization outside your scope');
      }
    }

    const username = normalizeUsername(data.username);
    const email = data.email?.trim() ? data.email.trim().toLowerCase() : null;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, ...(email ? [{ email }] : [])],
      },
    });
    if (existingUser) {
      throw new ConflictException(
        existingUser.username === username
          ? 'Username is already taken'
          : 'Email is already in use',
      );
    }

    const roles = await this.prisma.role.findMany({
      where: {
        name: { in: data.roleNames },
        OR: [
          { scopeKey: PLATFORM_SCOPE },
          ...(data.organizationIds?.length
            ? [{ scopeKey: { in: data.organizationIds } }]
            : []),
        ],
      },
    });
    const foundNames = new Set(roles.map((r) => r.name));
    if (data.roleNames.some((n) => !foundNames.has(n))) {
      throw new BadRequestException('One or more roles are invalid');
    }

    const passwordHash = await argon2.hash(data.password);
    const orgIds = data.organizationIds ?? [];
    const created = await this.prisma.user.create({
      data: {
        username,
        email,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash,
        status: AccountStatus.ACTIVE,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
        organizationAssignments: {
          create: orgIds.map((organizationId, index) => ({
            organizationId,
            isDefault: index === 0,
          })),
        },
        campusAssignments: {
          create: (data.campusIds ?? []).map((campusId) => ({ campusId })),
        },
        programAssignments: {
          create: (data.programIds ?? []).map((programId) => ({ programId })),
        },
      },
      include: {
        roles: { include: { role: true } },
        organizationAssignments: true,
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'User.Create',
      resource: 'User',
      resourceId: created.id,
      newValue: {
        username: created.username,
        email: created.email,
        roles: data.roleNames,
        organizationIds: orgIds,
      },
    });

    const { passwordHash: _omit, ...safe } = created as typeof created & { passwordHash?: string };
    return safe;
  }

  async assignRole(actor: AuthUser, userId: string, roleName: string, organizationId?: string) {
    if (roleName === 'SuperAdmin' && !actor.isSuperAdmin) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }
    const role = await this.prisma.role.findFirst({
      where: {
        name: roleName,
        OR: [
          { scopeKey: PLATFORM_SCOPE },
          ...(organizationId ? [{ scopeKey: organizationId }] : []),
        ],
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, organizationId },
      update: { organizationId },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'User.RoleAssign',
      resource: 'User',
      resourceId: userId,
      organizationId,
      newValue: { roleName },
    });
    return { success: true };
  }

  private async assertCanManageUser(actor: AuthUser, userId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: { include: { role: true } },
        organizationAssignments: true,
      },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.roles.some((r) => r.role.name === 'SuperAdmin') && !actor.isSuperAdmin) {
      throw new ForbiddenException('Cannot modify Super Admin');
    }
    if (!actor.isSuperAdmin) {
      const overlap = target.organizationAssignments.some((a) =>
        actor.organizationIds.includes(a.organizationId),
      );
      if (!overlap) throw new NotFoundException('User not found');
    }
    return target;
  }

  async setStatus(actor: AuthUser, userId: string, status: AccountStatus) {
    await this.assertCanManageUser(actor, userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        status: true,
      },
    });
  }

  async updateProfile(
    actor: AuthUser,
    userId: string,
    data: Partial<{ fullName: string; phone: string }>,
  ) {
    await this.assertCanManageUser(actor, userId);
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
      },
    });
  }

  async softDelete(actor: AuthUser, userId: string) {
    const target = await this.assertCanManageUser(actor, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), status: AccountStatus.INACTIVE },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'User.Delete',
      resource: 'User',
      resourceId: userId,
      previousValue: { username: target.username, email: target.email },
    });
    return { success: true };
  }
}
