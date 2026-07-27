import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MealSessionsController } from './meal-sessions.controller';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';

@Module({
  imports: [AuditModule],
  controllers: [MealsController, MealSessionsController],
  providers: [MealsService],
  exports: [MealsService],
})
export class MealsModule {}
