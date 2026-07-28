import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LeaveModule } from '../leave/leave.module';
import { MealSessionsController } from './meal-sessions.controller';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';

@Module({
  imports: [AuditModule, forwardRef(() => LeaveModule)],
  controllers: [MealsController, MealSessionsController],
  providers: [MealsService],
  exports: [MealsService],
})
export class MealsModule {}
