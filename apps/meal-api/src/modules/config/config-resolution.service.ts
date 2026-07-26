import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_SCOPE } from '../auth/auth.types';

/**
 * Resolves org overrides over platform defaults for settings and business rules.
 */
@Injectable()
export class ConfigResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async getSetting<T = unknown>(
    key: string,
    organizationId?: string | null,
    fallback?: T,
  ): Promise<T | undefined> {
    if (organizationId) {
      const orgSetting = await this.prisma.systemSetting.findUnique({
        where: { scopeKey_key: { scopeKey: organizationId, key } },
      });
      if (orgSetting) return orgSetting.value as T;
    }
    const platform = await this.prisma.systemSetting.findUnique({
      where: { scopeKey_key: { scopeKey: PLATFORM_SCOPE, key } },
    });
    if (platform) return platform.value as T;
    return fallback;
  }

  async getRule<T = unknown>(
    key: string,
    organizationId?: string | null,
    fallback?: T,
  ): Promise<T | undefined> {
    if (organizationId) {
      const orgRule = await this.prisma.businessRule.findUnique({
        where: { scopeKey_key: { scopeKey: organizationId, key } },
      });
      if (orgRule) return orgRule.value as T;
    }
    const platform = await this.prisma.businessRule.findUnique({
      where: { scopeKey_key: { scopeKey: PLATFORM_SCOPE, key } },
    });
    if (platform) return platform.value as T;
    return fallback;
  }

  async upsertSetting(
    key: string,
    value: Prisma.InputJsonValue,
    organizationId?: string | null,
    updatedById?: string,
  ) {
    const scopeKey = organizationId ?? PLATFORM_SCOPE;
    return this.prisma.systemSetting.upsert({
      where: { scopeKey_key: { scopeKey, key } },
      create: {
        key,
        value,
        scopeKey,
        organizationId: organizationId ?? null,
        updatedById,
      },
      update: { value, updatedById },
    });
  }

  async upsertRule(
    key: string,
    value: Prisma.InputJsonValue,
    organizationId?: string | null,
    description?: string,
    updatedById?: string,
  ) {
    const scopeKey = organizationId ?? PLATFORM_SCOPE;
    return this.prisma.businessRule.upsert({
      where: { scopeKey_key: { scopeKey, key } },
      create: {
        key,
        value,
        scopeKey,
        organizationId: organizationId ?? null,
        description,
        updatedById,
      },
      update: { value, description, updatedById },
    });
  }

  async listReferenceItems(categoryKey: string, organizationId?: string | null) {
    if (organizationId) {
      const orgCategory = await this.prisma.referenceDataCategory.findUnique({
        where: { scopeKey_key: { scopeKey: organizationId, key: categoryKey } },
        include: { items: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
      });
      if (orgCategory) return orgCategory.items;
    }
    const platform = await this.prisma.referenceDataCategory.findUnique({
      where: { scopeKey_key: { scopeKey: PLATFORM_SCOPE, key: categoryKey } },
      include: { items: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
    });
    return platform?.items ?? [];
  }
}
