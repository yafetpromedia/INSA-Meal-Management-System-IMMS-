import { Body, Controller, ForbiddenException, Get, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser, resolveActiveOrganizationId } from '../auth/auth.types';
import { ConfigResolutionService } from './config-resolution.service';
import { PrismaService } from '../../prisma/prisma.service';

class UpsertDto {
  @IsString() key!: string;
  @IsObject() value!: Record<string, string | number | boolean | null>;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() description?: string;
}

@Controller('platform-config')
export class PlatformConfigController {
  constructor(
    private readonly config: ConfigResolutionService,
    private readonly prisma: PrismaService,
  ) {}

  private requireOrg(user: AuthUser, organizationId?: string) {
    if (organizationId && !resolveActiveOrganizationId(user, organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }
    return resolveActiveOrganizationId(user, organizationId);
  }

  @Get('modules')
  @RequirePermissions('Settings.View')
  listModules(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    const orgId = this.requireOrg(user, organizationId);
    if (!orgId) {
      return user.isSuperAdmin
        ? this.prisma.organizationModule.findMany({ include: { module: true }, orderBy: { module: { sortOrder: 'asc' } } })
        : [];
    }
    return this.prisma.organizationModule.findMany({
      where: { organizationId: orgId },
      include: { module: true },
      orderBy: { module: { sortOrder: 'asc' } },
    });
  }

  @Get('reference')
  @RequirePermissions('Settings.View')
  reference(
    @CurrentUser() user: AuthUser,
    @Query('category') category: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = this.requireOrg(user, organizationId);
    return this.config.listReferenceItems(category, orgId);
  }

  @Get('rules')
  @RequirePermissions('Settings.View')
  rules(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    const orgId = this.requireOrg(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new ForbiddenException('Organization context required');
    }
    return this.prisma.businessRule.findMany({
      where: orgId
        ? { OR: [{ scopeKey: orgId }, { scopeKey: '__platform__' }] }
        : { scopeKey: '__platform__' },
      orderBy: { key: 'asc' },
    });
  }

  @Put('settings')
  @RequirePermissions('Settings.Manage')
  upsertSetting(@CurrentUser() user: AuthUser, @Body() dto: UpsertDto) {
    if (user.isSuperAdmin && !dto.organizationId) {
      return this.config.upsertSetting(dto.key, dto.value as Prisma.InputJsonValue, null, user.id);
    }
    const orgId = this.requireOrg(user, dto.organizationId);
    if (!orgId) throw new ForbiddenException('Organization context required');
    return this.config.upsertSetting(dto.key, dto.value as Prisma.InputJsonValue, orgId, user.id);
  }

  @Put('rules')
  @RequirePermissions('Settings.Manage')
  upsertRule(@CurrentUser() user: AuthUser, @Body() dto: UpsertDto) {
    if (user.isSuperAdmin && !dto.organizationId) {
      return this.config.upsertRule(
        dto.key,
        dto.value as Prisma.InputJsonValue,
        null,
        dto.description,
        user.id,
      );
    }
    const orgId = this.requireOrg(user, dto.organizationId);
    if (!orgId) throw new ForbiddenException('Organization context required');
    return this.config.upsertRule(
      dto.key,
      dto.value as Prisma.InputJsonValue,
      orgId,
      dto.description,
      user.id,
    );
  }

  @Get('custom-fields')
  @RequirePermissions('Settings.View')
  customFields(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType: string,
    @Query('organizationId') organizationId?: string,
  ) {
    const orgId = this.requireOrg(user, organizationId);
    if (!orgId) return [];
    return this.prisma.customFieldDefinition.findMany({
      where: { organizationId: orgId, entityType, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
