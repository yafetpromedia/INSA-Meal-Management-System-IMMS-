import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser, resolveActiveOrganizationId } from '../auth/auth.types';
import { MealsService } from './meals.service';

class PatchMealSessionDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @Matches(/^\d{2}:\d{2}$/) startTime?: string;
  @IsOptional() @IsString() @Matches(/^\d{2}:\d{2}$/) endTime?: string;
  @IsOptional() @IsInt() gracePeriod?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
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

@Controller('meal-sessions')
export class MealSessionsController {
  constructor(private readonly meals: MealsService) {}

  @Get()
  @RequirePermissions('Meal.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
  ) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId) return [];
    return this.meals.listConfigs(orgId, campusId);
  }

  @Post()
  @RequirePermissions('Meal.Update')
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertMealSessionDto) {
    return this.meals.upsertSession(user, dto);
  }

  @Put()
  @RequirePermissions('Meal.Update')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertMealSessionDto) {
    return this.meals.upsertSession(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Meal.Update')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PatchMealSessionDto,
  ) {
    return this.meals.updateSessionById(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Meal.Update')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.meals.softDeleteSession(user, id);
  }
}
