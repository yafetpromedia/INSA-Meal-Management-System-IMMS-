import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GateController } from './gate.controller';
import { LeaveRequestsController } from './leave-requests.controller';
import { LeaveTypesController } from './leave-types.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [AuditModule],
  controllers: [LeaveTypesController, LeaveRequestsController, GateController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
