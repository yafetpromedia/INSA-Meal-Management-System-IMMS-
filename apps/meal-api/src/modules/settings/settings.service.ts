import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigResolutionService } from '../config/config-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser, resolveActiveOrganizationId } from '../auth/auth.types';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigResolutionService,
  ) {}

  list(user: AuthUser, organizationId?: string) {
    if (organizationId && !resolveActiveOrganizationId(user, organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new ForbiddenException('Organization context required');
    }
    if (!orgId && user.isSuperAdmin) {
      return this.prisma.systemSetting.findMany({
        where: { scopeKey: '__platform__' },
        orderBy: { key: 'asc' },
      });
    }
    return this.prisma.systemSetting.findMany({
      where: { OR: [{ scopeKey: orgId! }, { scopeKey: '__platform__' }] },
      orderBy: { key: 'asc' },
    });
  }

  async upsert(
    user: AuthUser,
    key: string,
    value: Prisma.InputJsonValue,
    organizationId?: string,
  ) {
    if (user.isSuperAdmin && !organizationId) {
      return this.config.upsertSetting(key, value, null, user.id);
    }
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId) {
      throw new ForbiddenException('Organization context required');
    }
    return this.config.upsertSetting(key, value, orgId, user.id);
  }
}
