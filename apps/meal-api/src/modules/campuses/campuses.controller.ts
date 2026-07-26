import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EntityStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { CampusesService } from './campuses.service';

class CreateCampusDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) shortName!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
}

class UpdateCampusDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() shortName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() logoUrl?: string;
}

class StatusDto {
  @IsEnum(EntityStatus)
  status!: EntityStatus;
}

@Controller('campuses')
export class CampusesController {
  constructor(private readonly campuses: CampusesService) {}

  @Get()
  @RequirePermissions('Campus.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.campuses.list(user, search, organizationId);
  }

  @Get(':id')
  @RequirePermissions('Campus.View')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campuses.get(user, id);
  }

  @Post()
  @RequirePermissions('Campus.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampusDto) {
    return this.campuses.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Campus.Update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCampusDto) {
    return this.campuses.update(user, id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('Campus.Update')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.campuses.setStatus(user, id, dto.status);
  }

  @Delete(':id')
  @RequirePermissions('Campus.Delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campuses.remove(user, id);
  }
}
