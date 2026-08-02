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
import { DisciplinaryService } from './disciplinary.service';

class CreateIncidentTypeDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) category!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class UpdateIncidentTypeDto {
  @IsOptional() @IsString() @MinLength(2) category?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Controller('incident-types')
export class IncidentTypesController {
  constructor(private readonly disciplinary: DisciplinaryService) {}

  @Get()
  @RequirePermissions('Disciplinary.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.disciplinary.listIncidentTypes(
      user,
      organizationId,
      activeOnly === 'true' || activeOnly === '1',
    );
  }

  @Post()
  @RequirePermissions('Disciplinary.ManageTypes')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentTypeDto) {
    return this.disciplinary.createIncidentType(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Disciplinary.ManageTypes')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentTypeDto,
  ) {
    return this.disciplinary.updateIncidentType(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Disciplinary.ManageTypes')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disciplinary.deleteIncidentType(user, id);
  }
}
