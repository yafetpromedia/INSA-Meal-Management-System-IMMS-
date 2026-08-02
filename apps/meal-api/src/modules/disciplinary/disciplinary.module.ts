import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ActionTypesController } from './action-types.controller';
import { DisciplinaryService } from './disciplinary.service';
import { IncidentTypesController } from './incident-types.controller';
import { IncidentsController } from './incidents.controller';

@Module({
  imports: [AuditModule],
  controllers: [IncidentTypesController, ActionTypesController, IncidentsController],
  providers: [DisciplinaryService],
  exports: [DisciplinaryService],
})
export class DisciplinaryModule {}
