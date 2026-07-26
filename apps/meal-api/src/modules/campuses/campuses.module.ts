import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CampusesController } from './campuses.controller';
import { CampusesService } from './campuses.service';

@Module({
  imports: [AuditModule],
  controllers: [CampusesController],
  providers: [CampusesService],
  exports: [CampusesService],
})
export class CampusesModule {}
