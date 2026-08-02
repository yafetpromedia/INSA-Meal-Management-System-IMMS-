import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolvePagination } from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/auth.types';
import { DisciplinaryService } from './disciplinary.service';

class CreateIncidentDto {
  @IsString() organizationId!: string;
  @IsString() studentId!: string;
  @IsString() incidentTypeId!: string;
  @IsOptional() @IsEnum(IncidentSeverity) severity?: IncidentSeverity;
  @IsString() occurredAt!: string;
  @IsOptional() @IsString() location?: string;
  @IsString() @MinLength(5) description!: string;
  @IsOptional() @IsString() witnesses?: string;
  @IsOptional() @IsString() evidenceUrl?: string;
  @IsOptional() @IsString() leaveRequestId?: string;
  @IsOptional() @IsString() assignedToId?: string;
}

class UpdateIncidentDto {
  @IsOptional() @IsEnum(IncidentSeverity) severity?: IncidentSeverity;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() @MinLength(5) description?: string;
  @IsOptional() @IsString() witnesses?: string;
  @IsOptional() @IsString() evidenceUrl?: string;
  @IsOptional() @IsString() assignedToId?: string;
}

class NotesDto {
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() assignedToId?: string;
}

class AssignActionDto {
  @IsString() actionTypeId!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() decisionNotes?: string;
}

@Controller('disciplinary-incidents')
export class IncidentsController {
  constructor(private readonly disciplinary: DisciplinaryService) {}

  @Get()
  @RequirePermissions('Disciplinary.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: IncidentStatus,
    @Query('severity') severity?: IncidentSeverity,
    @Query('campusId') campusId?: string,
    @Query('studentId') studentId?: string,
    @Query('incidentTypeId') incidentTypeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mineOnly') mineOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const p = resolvePagination({ page, limit, skip, take });
    return this.disciplinary.list(user, {
      organizationId,
      status,
      severity,
      campusId,
      studentId,
      incidentTypeId,
      from,
      to,
      mineOnly: mineOnly === 'true' || mineOnly === '1',
      skip: p.skip,
      take: p.take,
      page: p.page,
      limit: p.limit,
    });
  }

  @Get('summary')
  @RequirePermissions('Disciplinary.View')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.disciplinary.summary(user, organizationId);
  }

  @Get('reports')
  @RequirePermissions('Disciplinary.Report')
  reports(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
  ) {
    return this.disciplinary.reports(user, {
      organizationId,
      from,
      to,
      campusId,
      programId,
    });
  }

  @Get('student/:studentId')
  @RequirePermissions('Disciplinary.View')
  forStudent(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
  ) {
    return this.disciplinary.listForStudent(user, studentId);
  }

  @Get('student/:studentId/alert')
  @RequirePermissions('Disciplinary.View')
  studentAlert(
    @CurrentUser() user: AuthUser,
    @Param('studentId') studentId: string,
  ) {
    return this.disciplinary.studentAlert(user, studentId);
  }

  @Post('actions/:actionId/complete')
  @RequirePermissions('Disciplinary.Update')
  completeAction(
    @CurrentUser() user: AuthUser,
    @Param('actionId') actionId: string,
  ) {
    return this.disciplinary.completeAction(user, actionId);
  }

  @Get(':id')
  @RequirePermissions('Disciplinary.View')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disciplinary.getById(user, id);
  }

  @Post()
  @RequirePermissions('Disciplinary.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentDto) {
    return this.disciplinary.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Disciplinary.Update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.disciplinary.update(user, id, dto);
  }

  @Post(':id/investigate')
  @RequirePermissions('Disciplinary.Investigate')
  investigate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NotesDto,
  ) {
    return this.disciplinary.startInvestigation(user, id, dto);
  }

  @Post(':id/submit-decision')
  @RequirePermissions('Disciplinary.Investigate')
  submitDecision(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NotesDto,
  ) {
    return this.disciplinary.submitForDecision(user, id, dto.notes);
  }

  @Post(':id/assign-action')
  @RequirePermissions('Disciplinary.Decide')
  assignAction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignActionDto,
  ) {
    return this.disciplinary.assignAction(user, id, dto);
  }

  @Post(':id/acknowledge')
  @RequirePermissions('Disciplinary.Update')
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NotesDto,
  ) {
    return this.disciplinary.acknowledge(user, id, dto.notes);
  }

  @Post(':id/close')
  @RequirePermissions('Disciplinary.Decide')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NotesDto,
  ) {
    return this.disciplinary.close(user, id, dto.notes);
  }

  @Post(':id/appeal')
  @RequirePermissions('Disciplinary.Decide')
  appeal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NotesDto,
  ) {
    return this.disciplinary.appeal(user, id, dto.notes);
  }
}
