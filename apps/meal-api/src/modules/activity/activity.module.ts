import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ActivityCategoriesController } from './activity-categories.controller';
import { ActivityReportsController } from './activity-reports.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [AuditModule],
  controllers: [ActivityCategoriesController, ActivityReportsController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
