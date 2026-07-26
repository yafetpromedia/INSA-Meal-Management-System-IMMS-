import { Module } from '@nestjs/common';
import { MealsModule } from '../meals/meals.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [MealsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
