import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser, resolveActiveOrganizationId } from '../auth/auth.types';
import { MealsService } from './meals.service';

class ServeMealDto {
  @IsString() @MinLength(2) barcode!: string;
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsBoolean() override?: boolean;
  @IsOptional() @IsString() overrideReason?: string;
  @IsOptional() @IsString() scannerDevice?: string;
  @IsOptional() @IsString() location?: string;
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
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.meals.history(user, {
      organizationId,
      campusId,
      studentId,
      mealCode,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post('serve')
  @RequirePermissions('Meal.Create')
  serve(@CurrentUser() user: AuthUser, @Body() dto: ServeMealDto) {
    return this.meals.verifyAndServe(user, dto);
  }
}
