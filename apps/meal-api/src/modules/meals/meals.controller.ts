import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolvePagination } from '../../common/utils/pagination.util';
import { AuthUser, resolveActiveOrganizationId } from '../auth/auth.types';
import { MealsService } from './meals.service';

class ServeMealDto {
  @ValidateIf((o: ServeMealDto) => !o.studentId)
  @IsString()
  @MinLength(2)
  barcode?: string;

  @ValidateIf((o: ServeMealDto) => !o.barcode)
  @IsString()
  studentId?: string;

  @IsOptional() @IsString() mealCode?: string;
  @IsOptional() @IsString() mealSessionId?: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsBoolean() override?: boolean;
  @IsOptional() @IsString() overrideReason?: string;
  @IsOptional() @IsString() scannerDevice?: string;
  @IsOptional() @IsString() location?: string;
}

class VerifyMealDto {
  @ValidateIf((o: VerifyMealDto) => !o.studentId)
  @IsString()
  @MinLength(2)
  barcode?: string;

  @ValidateIf((o: VerifyMealDto) => !o.barcode)
  @IsString()
  studentId?: string;

  @IsOptional() @IsString() organizationId?: string;
}

class UpsertMealSessionDto {
  @IsString() organizationId!: string;
  @IsOptional() @IsString() campusId?: string;
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @IsString() @Matches(/^\d{2}:\d{2}$/) endTime!: string;
  @IsOptional() @IsInt() gracePeriod?: number;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('meals')
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  @Get('sessions')
  @RequirePermissions('Meal.View')
  sessions(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
  ) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId) return [];
    return this.meals.listConfigs(orgId, campusId);
  }

  @Put('sessions')
  @RequirePermissions('Meal.Update')
  upsertSession(@CurrentUser() user: AuthUser, @Body() dto: UpsertMealSessionDto) {
    return this.meals.upsertSession(user, dto);
  }

  @Get('current')
  @RequirePermissions('Meal.View')
  current(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
  ) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId) return null;
    return this.meals.currentMeal(orgId, campusId);
  }

  @Get('today-stats')
  @RequirePermissions('Meal.View')
  todayStats(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.meals.todayStats(user, organizationId);
  }

  @Get('history')
  @RequirePermissions('Meal.View')
  history(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('studentId') studentId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const p = resolvePagination({ page, limit, skip, take });
    return this.meals.history(user, {
      organizationId,
      campusId,
      studentId,
      mealCode,
      skip: p.skip,
      take: p.take,
      page: p.page,
      limit: p.limit,
    });
  }

  @Get('history/:studentId')
  @RequirePermissions('Meal.View')
  historyByStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
    @Query('organizationId') organizationId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = resolvePagination({ page, limit });
    return this.meals.history(user, {
      organizationId,
      studentId,
      skip: p.skip,
      take: p.take,
      page: p.page,
      limit: p.limit,
    });
  }

  @Post('verify')
  @HttpCode(200)
  @RequirePermissions('Meal.View')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyMealDto) {
    return this.meals.verifyEligibility(user, dto);
  }

  @Post('serve')
  @RequirePermissions('Meal.Create')
  serve(@CurrentUser() user: AuthUser, @Body() dto: ServeMealDto) {
    return this.meals.verifyAndServe(user, dto);
  }
}
