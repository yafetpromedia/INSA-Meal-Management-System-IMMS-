import { Body, Controller, Get, Put, Query } from '@nestjs/common';
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

  @Get('modules')
  @RequirePermissions('Settings.View')
  listModules(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.prisma.organizationModule.findMany({
      where: orgId ? { organizationId: orgId } : undefined,
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
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.config.listReferenceItems(category, orgId);
  }

  @Get('rules')
  @RequirePermissions('Settings.View')
  rules(@Query('organizationId') organizationId?: string) {
    return this.prisma.businessRule.findMany({
      where: organizationId
        ? { OR: [{ scopeKey: organizationId }, { scopeKey: '__platform__' }] }
        : undefined,
      orderBy: { key: 'asc' },
    });
  }

  @Put('settings')
  @RequirePermissions('Settings.Manage')
  upsertSetting(@CurrentUser() user: AuthUser, @Body() dto: UpsertDto) {
    const orgId = dto.organizationId
      ? resolveActiveOrganizationId(user, dto.organizationId)
      : null;
    return this.config.upsertSetting(
      dto.key,
      dto.value as Prisma.InputJsonValue,
      user.isSuperAdmin ? orgId : resolveActiveOrganizationId(user, dto.organizationId),
      user.id,
    );
  }

  @Put('rules')
  @RequirePermissions('Settings.Manage')
  upsertRule(@CurrentUser() user: AuthUser, @Body() dto: UpsertDto) {
    const orgId = user.isSuperAdmin
      ? (dto.organizationId ?? null)
      : resolveActiveOrganizationId(user, dto.organizationId);
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
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId) return [];
    return this.prisma.customFieldDefinition.findMany({
      where: { organizationId: orgId, entityType, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
