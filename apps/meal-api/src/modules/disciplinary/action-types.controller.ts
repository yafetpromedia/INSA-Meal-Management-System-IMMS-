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

class CreateActionTypeDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() affectsMeals?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

class UpdateActionTypeDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() affectsMeals?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Controller('disciplinary-action-types')
export class ActionTypesController {
  constructor(private readonly disciplinary: DisciplinaryService) {}

  @Get()
  @RequirePermissions('Disciplinary.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.disciplinary.listActionTypes(
      user,
      organizationId,
      activeOnly === 'true' || activeOnly === '1',
    );
  }

  @Post()
  @RequirePermissions('Disciplinary.ManageTypes')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateActionTypeDto) {
    return this.disciplinary.createActionType(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Disciplinary.ManageTypes')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateActionTypeDto,
  ) {
    return this.disciplinary.updateActionType(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Disciplinary.ManageTypes')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disciplinary.deleteActionType(user, id);
  }
}
