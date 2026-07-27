import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MentorsController } from './mentors.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuditModule],
  controllers: [UsersController, MentorsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
