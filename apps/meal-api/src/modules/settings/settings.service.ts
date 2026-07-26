import { Injectable } from '@nestjs/common';
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
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.prisma.systemSetting.findMany({
      where: orgId
        ? { OR: [{ scopeKey: orgId }, { scopeKey: '__platform__' }] }
        : undefined,
      orderBy: { key: 'asc' },
    });
  }

  async upsert(
    user: AuthUser,
    key: string,
    value: Prisma.InputJsonValue,
    organizationId?: string,
  ) {
    const orgId = user.isSuperAdmin
      ? (organizationId ?? null)
      : resolveActiveOrganizationId(user, organizationId);
    return this.config.upsertSetting(key, value, orgId, user.id);
  }
}
