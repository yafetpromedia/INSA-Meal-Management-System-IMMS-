import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RolesService } from './roles.service';

class CreateRoleDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @IsString({ each: true }) permissionKeys!: string[];
}

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('Role.View')
  list(@Query('organizationId') organizationId?: string) {
    return this.roles.listRoles(organizationId);
  }

  @Get('permissions')
  @RequirePermissions('Role.View')
  permissions() {
    return this.roles.listPermissions();
  }

  @Post()
  @RequirePermissions('Role.Manage')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.createCustomRole(dto);
  }
}
