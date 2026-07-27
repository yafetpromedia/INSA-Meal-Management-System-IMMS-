import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { ReportFilters, ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private filters(query: {
    organizationId?: string;
    campusId?: string;
    programId?: string;
    mealCode?: string;
    from?: string;
    to?: string;
  }): ReportFilters {
    return {
      organizationId: query.organizationId,
      campusId: query.campusId,
      programId: query.programId,
      mealCode: query.mealCode,
      from: query.from,
      to: query.to,
    };
  }

  @Get('meals')
  @RequirePermissions('Report.View')
  meals(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.mealsReport(
      user,
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }

  @Get('daily')
  @RequirePermissions('Report.View')
  daily(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.periodReport(
      user,
      'daily',
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }

  @Get('weekly')
  @RequirePermissions('Report.View')
  weekly(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.periodReport(
      user,
      'weekly',
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }

  @Get('monthly')
  @RequirePermissions('Report.View')
  monthly(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.periodReport(
      user,
      'monthly',
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }

  @Get('trend')
  @RequirePermissions('Report.View')
  trend(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('days') days?: string,
  ) {
    const n = days ? Number(days) : 7;
    return this.reports.trend(
      user,
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
      Number.isFinite(n) ? n : 7,
    );
  }

  @Get('campus')
  @RequirePermissions('Report.View')
  campus(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.groupReport(
      user,
      'campus',
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }

  @Get('mentor')
  @RequirePermissions('Report.View')
  mentor(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.groupReport(
      user,
      'mentor',
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }

  @Get('export')
  @RequirePermissions('Report.Export')
  export(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.mealsReport(
      user,
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }

  @Get('export/meals')
  @RequirePermissions('Report.Export')
  exportMeals(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('mealCode') mealCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reports.mealsReport(
      user,
      this.filters({ organizationId, campusId, programId, mealCode, from, to }),
    );
  }
}
