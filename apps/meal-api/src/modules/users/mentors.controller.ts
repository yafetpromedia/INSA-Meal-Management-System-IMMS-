import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

/** Operational staff: Mentor, FoodStaff (cafeteria), GateOfficer (exit/return). */
const STAFF_ROLES = ['Mentor', 'FoodStaff', 'GateOfficer'] as const;

class CreateMentorDto {
  @IsString() @MinLength(3) username!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() phone?: string;
  /** Mentor = meal ops + history; FoodStaff = cafeteria scan; GateOfficer = gate. */
  @IsOptional() @IsIn(STAFF_ROLES) roleName?: 'Mentor' | 'FoodStaff' | 'GateOfficer';
  @IsOptional() @IsArray() @IsString({ each: true }) organizationIds?: string[];
  /** Non-mentor staff may have multiple campuses. */
  @IsOptional() @IsArray() @IsString({ each: true }) campusIds?: string[];
  /** Mentors: exactly one campus. */
  @ValidateIf((o: CreateMentorDto) => (o.roleName ?? 'Mentor') === 'Mentor')
  @IsString()
  campusId?: string;
  @IsOptional() @IsString() programId?: string;
  @ValidateIf((o: CreateMentorDto) => (o.roleName ?? 'Mentor') === 'Mentor')
  @IsString()
  academicYearId?: string;
}

class UpdateMentorDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) campusIds?: string[];
  @IsOptional() @IsString() campusId?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  programId?: string | null;
  @IsOptional() @IsString() academicYearId?: string;
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
      requireCampus: true,
    });
  }

  @Patch(':id')
  @RequirePermissions('User.Update')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMentorDto,
  ) {
    return this.users.updateStaff(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('User.Update')
  softDelete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.softDelete(user, id);
  }
}
