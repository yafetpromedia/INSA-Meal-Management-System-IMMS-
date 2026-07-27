import { Controller, Delete, ForbiddenException, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolvePagination } from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('AuditLog.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('resource') resource?: string,
  ) {
    const p = resolvePagination({ page, limit, skip, take });
    return this.audit.list(user, {
      skip: p.skip,
      take: p.take,
      page: p.page,
      limit: p.limit,
      action,
      userId,
      resource,
    });
  }

  /** Audit logs are immutable (SRS Part 5.17 / 5.22). */
  @Delete(':id')
  @RequirePermissions('AuditLog.View')
  remove(@Param('id') _id: string) {
    throw new ForbiddenException('Audit logs are immutable and cannot be deleted');
  }
}
