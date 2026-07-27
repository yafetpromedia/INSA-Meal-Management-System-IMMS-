import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsString() @MinLength(3) username!: string;
  @IsOptional() @IsString() email?: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() phone?: string;
  @IsArray() @IsString({ each: true }) roleNames!: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) organizationIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) campusIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) programIds?: string[];
}

class AssignRoleDto {
  @IsString() roleName!: string;
  @IsOptional() @IsString() organizationId?: string;
}

class StatusDto {
  @IsEnum(AccountStatus) status!: AccountStatus;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('User.View')
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user);
  }

  @Post()
  @RequirePermissions('User.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Post(':id/roles')
  @RequirePermissions('User.Assign')
  assignRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.users.assignRole(user, id, dto.roleName, dto.organizationId);
  }

  @Patch(':id/status')
  @RequirePermissions('User.Update')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: StatusDto,
  ) {
    return this.users.setStatus(user, id, dto.status);
  }
}
