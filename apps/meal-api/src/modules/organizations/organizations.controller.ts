import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { OrganizationsService } from './organizations.service';

class CreateOrgDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() locale?: string;
}

class UpdateOrgDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsObject() branding?: object;
  @IsOptional() @IsEnum(EntityStatus) status?: EntityStatus;
}

class ModuleToggleDto {
  @IsBoolean() isEnabled!: boolean;
  @IsOptional() @IsObject() config?: object;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions('Organization.View')
  list(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.organizations.list(user, search);
  }

  @Get(':id')
  @RequirePermissions('Organization.View')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.organizations.get(user, id);
  }

  @Post()
  @RequirePermissions('Organization.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgDto) {
    return this.organizations.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Organization.Update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateOrgDto) {
    return this.organizations.update(user, id, dto);
  }

  @Post(':id/modules/:moduleKey')
  @RequirePermissions('Organization.Manage')
  setModule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('moduleKey') moduleKey: string,
    @Body() dto: ModuleToggleDto,
  ) {
    return this.organizations.setModuleEnabled(user, id, moduleKey, dto.isEnabled, dto.config);
  }
}
