import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { AcademicYearsService } from './academic-years.service';

class CreateYearDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(4) name!: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
}

@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  @RequirePermissions('AcademicYear.View')
  list(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.years.list(user, organizationId);
  }

  @Post()
  @RequirePermissions('AcademicYear.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateYearDto) {
    return this.years.create(user, dto);
  }

  @Post(':id/set-current')
  @RequirePermissions('AcademicYear.Manage')
  setCurrent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.years.setCurrent(user, id);
  }
}
