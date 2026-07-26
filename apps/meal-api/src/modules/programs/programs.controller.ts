import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { ProgramsService } from './programs.service';

class CreateProgramDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() campusId!: string;
  @IsString() academicYearId!: string;
  @IsOptional() @IsInt() capacity?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() coordinatorId?: string;
}

class UpdateProgramDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() capacity?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(ProgramStatus) status?: ProgramStatus;
}

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get()
  @RequirePermissions('Program.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('campusId') campusId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.programs.list(user, campusId, organizationId);
  }

  @Get(':id')
  @RequirePermissions('Program.View')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.programs.get(user, id);
  }

  @Post()
  @RequirePermissions('Program.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProgramDto) {
    return this.programs.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Program.Update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProgramDto) {
    return this.programs.update(user, id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('Program.Update')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.programs.archive(user, id);
  }
}
