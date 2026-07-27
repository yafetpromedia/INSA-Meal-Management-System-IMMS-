import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

/** Operational meal staff: Mentor (broader) or FoodStaff (cafeteria door scan-only). */
const STAFF_ROLES = ['Mentor', 'FoodStaff'] as const;

class CreateMentorDto {
  @IsString() @MinLength(3) username!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() phone?: string;
  /** Mentor = meal ops + history; FoodStaff = cafeteria gate scan only. */
  @IsOptional() @IsIn(STAFF_ROLES) roleName?: 'Mentor' | 'FoodStaff';
  @IsOptional() @IsArray() @IsString({ each: true }) organizationIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) campusIds?: string[];
}

class UpdateMentorDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
}

@Controller('mentors')
export class MentorsController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('User.View')
  async list(@CurrentUser() user: AuthUser) {
    const all = await this.users.list(user);
    return all.filter((u) =>
      u.roles.some((r) => STAFF_ROLES.includes(r.role.name as (typeof STAFF_ROLES)[number])),
    );
  }

  @Post()
  @RequirePermissions('User.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMentorDto) {
    const { roleName, ...rest } = dto;
    return this.users.create(user, {
      ...rest,
      roleNames: [roleName ?? 'Mentor'],
    });
  }

  @Patch(':id')
  @RequirePermissions('User.Update')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMentorDto,
  ) {
    return this.users.updateProfile(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('User.Update')
  softDelete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.softDelete(user, id);
  }
}
