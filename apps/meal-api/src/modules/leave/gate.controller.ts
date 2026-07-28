import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { GateAction } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolvePagination } from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/auth.types';
import { LeaveService } from './leave.service';

class GateScanDto {
  @IsString() @MinLength(2) barcode!: string;
  @IsOptional() @IsString() gateLocation?: string;
  @IsOptional() @IsString() organizationId?: string;
}

@Controller('gate')
export class GateController {
  constructor(private readonly leave: LeaveService) {}

  @Post('exit')
  @HttpCode(200)
  @RequirePermissions('Gate.Scan')
  exit(@CurrentUser() user: AuthUser, @Body() dto: GateScanDto) {
    return this.leave.exit(user, dto);
  }

  @Post('return')
  @HttpCode(200)
  @RequirePermissions('Gate.Scan')
  returnScan(@CurrentUser() user: AuthUser, @Body() dto: GateScanDto) {
    return this.leave.returnScan(user, dto);
  }

  @Get('current-outside')
  @RequirePermissions('Gate.View')
  currentOutside(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.leave.currentOutside(user, organizationId);
  }

  @Get('overdue')
  @RequirePermissions('Gate.View')
  overdue(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.leave.overdue(user, organizationId);
  }

  @Get('history')
  @RequirePermissions('Gate.View')
  history(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('studentId') studentId?: string,
    @Query('action') action?: GateAction,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const p = resolvePagination({ page, limit, skip, take });
    return this.leave.history(user, {
      organizationId,
      campusId,
      studentId,
      action,
      from,
      to,
      skip: p.skip,
      take: p.take,
      page: p.page,
      limit: p.limit,
    });
  }
}
