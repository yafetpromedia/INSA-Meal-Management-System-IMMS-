import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('meals')
  @RequirePermissions('Report.View')
  meals(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.mealsReport(user, organizationId);
  }

  @Get('daily')
  @RequirePermissions('Report.View')
  daily(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.periodReport(user, 'daily', organizationId);
  }

  @Get('weekly')
  @RequirePermissions('Report.View')
  weekly(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.periodReport(user, 'weekly', organizationId);
  }

  @Get('monthly')
  @RequirePermissions('Report.View')
  monthly(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.periodReport(user, 'monthly', organizationId);
  }

  @Get('campus')
  @RequirePermissions('Report.View')
  campus(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.groupReport(user, 'campus', organizationId);
  }

  @Get('mentor')
  @RequirePermissions('Report.View')
  mentor(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.groupReport(user, 'mentor', organizationId);
  }

  @Get('export')
  @RequirePermissions('Report.Export')
  export(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.mealsReport(user, organizationId);
  }

  @Get('export/meals')
  @RequirePermissions('Report.Export')
  exportMeals(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.mealsReport(user, organizationId);
  }
}
