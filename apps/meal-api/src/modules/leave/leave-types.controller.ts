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
import { LeaveService } from './leave.service';

class CreateLeaveTypeDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class UpdateLeaveTypeDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leave: LeaveService) {}

  @Get()
  @RequirePermissions('Leave.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.leave.listTypes(
      user,
      organizationId,
      activeOnly === 'true' || activeOnly === '1',
    );
  }

  @Post()
  @RequirePermissions('Leave.ManageTypes')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveTypeDto) {
    return this.leave.createType(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Leave.ManageTypes')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leave.updateType(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Leave.ManageTypes')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.deleteType(user, id);
  }
}
