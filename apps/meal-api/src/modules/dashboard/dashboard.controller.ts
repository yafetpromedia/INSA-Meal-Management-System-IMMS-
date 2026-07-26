import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions('Dashboard.View')
  summary(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.dashboard.summary(user, organizationId);
  }

  @Get('activity')
  @RequirePermissions('Dashboard.View')
  activity(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.dashboard.activityFeed(user, organizationId);
  }
}
