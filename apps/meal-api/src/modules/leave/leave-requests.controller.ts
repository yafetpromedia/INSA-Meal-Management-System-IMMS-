import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LeaveRequestStatus } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolvePagination } from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/auth.types';
import { LeaveService } from './leave.service';

class CreateLeaveRequestDto {
  @IsString() organizationId!: string;
  @IsString() studentId!: string;
  @IsString() leaveTypeId!: string;
  @IsString() @MinLength(2) reason!: string;
  @IsString() @MinLength(2) destination!: string;
  @IsString() expectedExitTime!: string;
  @IsString() expectedReturnTime!: string;
  @IsOptional() @IsString() notes?: string;
}

class UpdateLeaveRequestDto {
  @IsOptional() @IsString() leaveTypeId?: string;
  @IsOptional() @IsString() @MinLength(2) reason?: string;
  @IsOptional() @IsString() @MinLength(2) destination?: string;
  @IsOptional() @IsString() expectedExitTime?: string;
  @IsOptional() @IsString() expectedReturnTime?: string;
  @IsOptional() @IsString() notes?: string;
}

class RejectLeaveDto {
  @IsString() @MinLength(2) reason!: string;
}

@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leave: LeaveService) {}

  @Get()
  @RequirePermissions('Leave.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: LeaveRequestStatus,
    @Query('campusId') campusId?: string,
    @Query('studentId') studentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const p = resolvePagination({ page, limit, skip, take });
    return this.leave.list(user, {
      organizationId,
      status,
      campusId,
      studentId,
      from,
      to,
      skip: p.skip,
      take: p.take,
      page: p.page,
      limit: p.limit,
    });
  }

  @Get('summary')
  @RequirePermissions('Leave.View')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.leave.summary(user, organizationId);
  }

  @Get('student/:studentId')
  @RequirePermissions('Leave.View')
  forStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
  ) {
    return this.leave.listForStudent(user, studentId);
  }

  @Get(':id')
  @RequirePermissions('Leave.View')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.getById(user, id);
  }

  @Post()
  @RequirePermissions('Leave.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leave.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Leave.Update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
  ) {
    return this.leave.update(user, id, dto);
  }

  @Post(':id/approve')
  @RequirePermissions('Leave.Approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.approve(user, id);
  }

  @Post(':id/reject')
  @RequirePermissions('Leave.Approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
  ) {
    return this.leave.reject(user, id, dto.reason);
  }

  @Post(':id/cancel')
  @RequirePermissions('Leave.Cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.cancel(user, id);
  }
}
