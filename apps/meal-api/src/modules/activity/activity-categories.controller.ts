import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { ActivityService } from './activity.service';

class CreateCategoryDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Controller('activity-categories')
export class ActivityCategoriesController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @RequirePermissions('Activity.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.activity.listCategories(
      user,
      organizationId,
      activeOnly === 'true' || activeOnly === '1',
    );
  }

  @Post()
  @RequirePermissions('Activity.ManageCategories')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.activity.createCategory(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Activity.ManageCategories')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.activity.updateCategory(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Activity.ManageCategories')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activity.deleteCategory(user, id);
  }
}
