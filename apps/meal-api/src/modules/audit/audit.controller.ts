import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from './audit.service';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('audit-logs')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('AuditLog.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('action') action?: string,
  ) {
    return this.audit.list(user, {
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
      action,
    });
  }

  @Delete(':id')
  @RequirePermissions('AuditLog.Delete')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin may delete audit logs');
    }
    await this.prisma.auditLog.delete({ where: { id } });
    return { success: true };
  }
}
