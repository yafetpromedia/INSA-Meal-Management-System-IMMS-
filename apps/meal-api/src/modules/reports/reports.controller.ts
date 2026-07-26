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

  @Get('export/meals')
  @RequirePermissions('Report.Export')
  exportMeals(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.reports.mealsReport(user, organizationId);
  }
}
