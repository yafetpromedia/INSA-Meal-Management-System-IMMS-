import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Allow, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { SettingsService } from './settings.service';

class UpsertSettingDto {
  @IsString() key!: string;
  /** JSON scalar or object (string, number, boolean, object, array). */
  @Allow()
  value!: Prisma.InputJsonValue;
  @IsOptional() @IsString() organizationId?: string;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions('Settings.View')
  list(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.settings.list(user, organizationId);
  }

  @Put()
  @RequirePermissions('Settings.Manage')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertSettingDto) {
    return this.settings.upsert(
      user,
      dto.key,
      dto.value as Prisma.InputJsonValue,
      dto.organizationId,
    );
  }
}
