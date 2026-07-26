import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MealsController } from './meals.controller';
import { MealsService } from './meals.service';

@Module({
  imports: [AuditModule],
  controllers: [MealsController],
  providers: [MealsService],
  exports: [MealsService],
})
export class MealsModule {}
