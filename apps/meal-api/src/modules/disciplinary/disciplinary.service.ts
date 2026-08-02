import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DisciplinaryActionStatus,
  IncidentSeverity,
  IncidentStatus,
  Prisma,
} from '@prisma/client';
import { ethiopiaDayStartUtc } from '../../common/timezone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  assertCampusAccess,
  assertOrgAccess,
  hasPermission,
  resolveActiveOrganizationId,
  resolveCampusId,
  scopeCampusFilter,
  scopeOrganizationFilter,
} from '../auth/auth.types';

const OPEN_STATUSES: IncidentStatus[] = [
  IncidentStatus.OPEN,
  IncidentStatus.UNDER_INVESTIGATION,
  IncidentStatus.AWAITING_DECISION,
  IncidentStatus.ACTION_ASSIGNED,
  IncidentStatus.APPEALED,
];

const ACTIVE_ACTION_STATUSES: DisciplinaryActionStatus[] = [
  DisciplinaryActionStatus.PENDING,
  DisciplinaryActionStatus.ACTIVE,
];

const incidentInclude = {
  student: {
    select: {
      id: true,
      studentId: true,
      fullName: true,
      barcode: true,
      status: true,
      campusId: true,
      programId: true,
      organizationId: true,
    },
  },
  incidentType: {
    select: { id: true, name: true, category: true, active: true },
  },
  campus: { select: { id: true, name: true, shortName: true } },
  program: { select: { id: true, name: true } },
  reportedBy: { select: { id: true, fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
  actions: {
    include: {
      actionType: {
        select: { id: true, name: true, affectsMeals: true, active: true },
      },
      assignedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

@Injectable()
export class DisciplinaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Incident types
  // ---------------------------------------------------------------------------

  async listIncidentTypes(user: AuthUser, organizationId?: string, activeOnly?: boolean) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException('Organization context required');
    }
    return this.prisma.incidentType.findMany({
      where: {
        deletedAt: null,
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createIncidentType(
    user: AuthUser,
    data: {
      organizationId: string;
      category: string;
      name: string;
      description?: string;
      sortOrder?: number;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }
    const type = await this.prisma.incidentType.create({
      data: {
        organizationId: data.organizationId,
        category: data.category.trim(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.TypeCreated',
      resource: 'IncidentType',
      resourceId: type.id,
      organizationId: data.organizationId,
      newValue: type,
    });
    return type;
  }

  async updateIncidentType(
    user: AuthUser,
    id: string,
    data: {
      category?: string;
      name?: string;
      description?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.incidentType.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Incident type not found');
    }
    const type = await this.prisma.incidentType.update({
      where: { id },
      data: {
        ...(data.category !== undefined ? { category: data.category.trim() } : {}),
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.TypeUpdated',
      resource: 'IncidentType',
      resourceId: id,
      organizationId: existing.organizationId,
      previousValue: existing,
      newValue: type,
    });
    return type;
  }

  async deleteIncidentType(user: AuthUser, id: string) {
    const existing = await this.prisma.incidentType.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { incidents: true } } },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Incident type not found');
    }
    if (existing._count.incidents > 0) {
      throw new BadRequestException(
        'Cannot delete incident type that has cases. Deactivate it instead.',
      );
    }
    const type = await this.prisma.incidentType.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.TypeDeleted',
      resource: 'IncidentType',
      resourceId: id,
      organizationId: existing.organizationId,
      previousValue: existing,
      newValue: type,
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Action types
  // ---------------------------------------------------------------------------

  async listActionTypes(user: AuthUser, organizationId?: string, activeOnly?: boolean) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException('Organization context required');
    }
    return this.prisma.disciplinaryActionType.findMany({
      where: {
        deletedAt: null,
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createActionType(
    user: AuthUser,
    data: {
      organizationId: string;
      name: string;
      description?: string;
      affectsMeals?: boolean;
      sortOrder?: number;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }
    const type = await this.prisma.disciplinaryActionType.create({
      data: {
        organizationId: data.organizationId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        affectsMeals: data.affectsMeals ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.ActionTypeCreated',
      resource: 'DisciplinaryActionType',
      resourceId: type.id,
      organizationId: data.organizationId,
      newValue: type,
    });
    return type;
  }

  async updateActionType(
    user: AuthUser,
    id: string,
    data: {
      name?: string;
      description?: string;
      affectsMeals?: boolean;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.disciplinaryActionType.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Action type not found');
    }
    const type = await this.prisma.disciplinaryActionType.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.affectsMeals !== undefined ? { affectsMeals: data.affectsMeals } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.ActionTypeUpdated',
      resource: 'DisciplinaryActionType',
      resourceId: id,
      organizationId: existing.organizationId,
      previousValue: existing,
      newValue: type,
    });
    return type;
  }

  async deleteActionType(user: AuthUser, id: string) {
    const existing = await this.prisma.disciplinaryActionType.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { actions: true } } },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Action type not found');
    }
    if (existing._count.actions > 0) {
      throw new BadRequestException(
        'Cannot delete action type that has been used. Deactivate it instead.',
      );
    }
    const type = await this.prisma.disciplinaryActionType.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.ActionTypeDeleted',
      resource: 'DisciplinaryActionType',
      resourceId: id,
      organizationId: existing.organizationId,
      previousValue: existing,
      newValue: type,
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Incidents
  // ---------------------------------------------------------------------------

  async list(
    user: AuthUser,
    query: {
      organizationId?: string;
      status?: IncidentStatus;
      severity?: IncidentSeverity;
      campusId?: string;
      studentId?: string;
      incidentTypeId?: string;
      from?: string;
      to?: string;
      mineOnly?: boolean;
      page?: number;
      limit?: number;
      skip?: number;
      take?: number;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    const campusFilter = resolveCampusId(user, query.campusId);
    if (query.campusId && campusFilter === undefined && !user.isSuperAdmin) {
      throw new ForbiddenException('Campus not in your scope');
    }

    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? query.limit ?? 20, 200);
    const mentorOnly =
      query.mineOnly ||
      (user.roles.includes('Mentor') &&
        !hasPermission(user, 'Disciplinary.Investigate') &&
        !hasPermission(user, 'Disciplinary.Decide'));

    const where: Prisma.DisciplinaryIncidentWhereInput = {
      deletedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...(campusFilter !== undefined
        ? { campusId: campusFilter }
        : scopeCampusFilter(user)),
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.incidentTypeId ? { incidentTypeId: query.incidentTypeId } : {}),
      ...(mentorOnly ? { reportedById: user.id } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.disciplinaryIncident.findMany({
        where,
        include: incidentInclude,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.disciplinaryIncident.count({ where }),
    ]);

    return { items, total, page: query.page ?? Math.floor(skip / take) + 1, limit: take };
  }

  async getById(user: AuthUser, id: string) {
    const incident = await this.prisma.disciplinaryIncident.findFirst({
      where: { id, deletedAt: null },
      include: incidentInclude,
    });
    if (!incident || !assertOrgAccess(user, incident.organizationId)) {
      throw new NotFoundException('Incident not found');
    }
    if (!assertCampusAccess(user, incident.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    const mentorOnly =
      user.roles.includes('Mentor') &&
      !hasPermission(user, 'Disciplinary.Investigate') &&
      !hasPermission(user, 'Disciplinary.Decide');
    if (mentorOnly && incident.reportedById !== user.id) {
      throw new ForbiddenException('You can only view incidents you reported');
    }
    return incident;
  }

  async listForStudent(user: AuthUser, studentKey: string) {
    const student = await this.resolveStudent(user, studentKey);
    return this.prisma.disciplinaryIncident.findMany({
      where: {
        studentId: student.id,
        deletedAt: null,
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
      },
      include: incidentInclude,
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  async create(
    user: AuthUser,
    dto: {
      organizationId: string;
      studentId: string;
      incidentTypeId: string;
      severity?: IncidentSeverity;
      occurredAt: string;
      location?: string;
      description: string;
      witnesses?: string;
      evidenceUrl?: string;
      leaveRequestId?: string;
      assignedToId?: string;
    },
  ) {
    if (!assertOrgAccess(user, dto.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }

    const student = await this.prisma.student.findFirst({
      where: {
        id: dto.studentId,
        organizationId: dto.organizationId,
        deletedAt: null,
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!assertCampusAccess(user, student.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }

    const type = await this.prisma.incidentType.findFirst({
      where: {
        id: dto.incidentTypeId,
        organizationId: dto.organizationId,
        deletedAt: null,
        active: true,
      },
    });
    if (!type) throw new BadRequestException('Invalid incident type');

    const incidentNumber = await this.nextIncidentNumber(dto.organizationId);
    const incident = await this.prisma.disciplinaryIncident.create({
      data: {
        organizationId: dto.organizationId,
        incidentNumber,
        studentId: student.id,
        campusId: student.campusId,
        programId: student.programId,
        incidentTypeId: type.id,
        severity: dto.severity ?? IncidentSeverity.LOW,
        status: IncidentStatus.OPEN,
        occurredAt: new Date(dto.occurredAt),
        location: dto.location?.trim() || null,
        description: dto.description.trim(),
        witnesses: dto.witnesses?.trim() || null,
        evidenceUrl: dto.evidenceUrl?.trim() || null,
        leaveRequestId: dto.leaveRequestId || null,
        reportedById: user.id,
        assignedToId: dto.assignedToId || null,
      },
      include: incidentInclude,
    });

    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.IncidentCreated',
      resource: 'DisciplinaryIncident',
      resourceId: incident.id,
      organizationId: dto.organizationId,
      campusId: student.campusId,
      newValue: {
        incidentNumber: incident.incidentNumber,
        studentId: student.studentId,
        severity: incident.severity,
        status: incident.status,
      },
    });

    return incident;
  }

  async update(
    user: AuthUser,
    id: string,
    data: {
      severity?: IncidentSeverity;
      location?: string;
      description?: string;
      witnesses?: string;
      evidenceUrl?: string;
      assignedToId?: string | null;
    },
  ) {
    const existing = await this.requireIncident(user, id);
    if (
      existing.status === IncidentStatus.CLOSED &&
      !hasPermission(user, 'Disciplinary.Decide')
    ) {
      throw new BadRequestException('Closed cases cannot be edited');
    }

    const incident = await this.prisma.disciplinaryIncident.update({
      where: { id },
      data: {
        ...(data.severity !== undefined ? { severity: data.severity } : {}),
        ...(data.location !== undefined
          ? { location: data.location?.trim() || null }
          : {}),
        ...(data.description !== undefined
          ? { description: data.description.trim() }
          : {}),
        ...(data.witnesses !== undefined
          ? { witnesses: data.witnesses?.trim() || null }
          : {}),
        ...(data.evidenceUrl !== undefined
          ? { evidenceUrl: data.evidenceUrl?.trim() || null }
          : {}),
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
      },
      include: incidentInclude,
    });

    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.IncidentUpdated',
      resource: 'DisciplinaryIncident',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      previousValue: { status: existing.status, severity: existing.severity },
      newValue: { status: incident.status, severity: incident.severity },
    });

    return incident;
  }

  async startInvestigation(
    user: AuthUser,
    id: string,
    data?: { assignedToId?: string; notes?: string },
  ) {
    const existing = await this.requireIncident(user, id);
    if (
      existing.status !== IncidentStatus.OPEN &&
      existing.status !== IncidentStatus.APPEALED
    ) {
      throw new BadRequestException('Only open or appealed cases can start investigation');
    }
    const incident = await this.prisma.disciplinaryIncident.update({
      where: { id },
      data: {
        status: IncidentStatus.UNDER_INVESTIGATION,
        assignedToId: data?.assignedToId ?? existing.assignedToId ?? user.id,
        ...(data?.notes
          ? {
              investigationNotes: [existing.investigationNotes, data.notes.trim()]
                .filter(Boolean)
                .join('\n\n'),
            }
          : {}),
      },
      include: incidentInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.InvestigationStarted',
      resource: 'DisciplinaryIncident',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      previousValue: { status: existing.status },
      newValue: { status: incident.status },
    });
    return incident;
  }

  async submitForDecision(user: AuthUser, id: string, notes?: string) {
    const existing = await this.requireIncident(user, id);
    if (existing.status !== IncidentStatus.UNDER_INVESTIGATION) {
      throw new BadRequestException('Case must be under investigation');
    }
    const incident = await this.prisma.disciplinaryIncident.update({
      where: { id },
      data: {
        status: IncidentStatus.AWAITING_DECISION,
        ...(notes
          ? {
              investigationNotes: [existing.investigationNotes, notes.trim()]
                .filter(Boolean)
                .join('\n\n'),
            }
          : {}),
      },
      include: incidentInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.SubmittedForDecision',
      resource: 'DisciplinaryIncident',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      previousValue: { status: existing.status },
      newValue: { status: incident.status },
    });
    return incident;
  }

  async assignAction(
    user: AuthUser,
    id: string,
    data: {
      actionTypeId: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      decisionNotes?: string;
    },
  ) {
    const existing = await this.requireIncident(user, id);
    this.assertSeverityDecision(user, existing.severity);

    const canAssign: IncidentStatus[] = [
      IncidentStatus.AWAITING_DECISION,
      IncidentStatus.UNDER_INVESTIGATION,
      IncidentStatus.OPEN,
      IncidentStatus.ACTION_ASSIGNED,
      IncidentStatus.APPEALED,
    ];
    if (!canAssign.includes(existing.status)) {
      throw new BadRequestException('Cannot assign action in the current status');
    }

    const actionType = await this.prisma.disciplinaryActionType.findFirst({
      where: {
        id: data.actionTypeId,
        organizationId: existing.organizationId,
        deletedAt: null,
        active: true,
      },
    });
    if (!actionType) throw new BadRequestException('Invalid action type');

    const [, incident] = await this.prisma.$transaction([
      this.prisma.disciplinaryAction.create({
        data: {
          organizationId: existing.organizationId,
          incidentId: id,
          actionTypeId: actionType.id,
          description: data.description?.trim() || null,
          assignedById: user.id,
          startDate: data.startDate ? new Date(data.startDate) : new Date(),
          endDate: data.endDate ? new Date(data.endDate) : null,
          status: DisciplinaryActionStatus.ACTIVE,
        },
      }),
      this.prisma.disciplinaryIncident.update({
        where: { id },
        data: {
          status: IncidentStatus.ACTION_ASSIGNED,
          decidedById: user.id,
          decidedAt: new Date(),
          ...(data.decisionNotes
            ? { decisionNotes: data.decisionNotes.trim() }
            : {}),
        },
        include: incidentInclude,
      }),
    ]);

    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.ActionAssigned',
      resource: 'DisciplinaryIncident',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      newValue: {
        actionType: actionType.name,
        status: IncidentStatus.ACTION_ASSIGNED,
      },
    });

    return incident;
  }

  async acknowledge(user: AuthUser, id: string, notes?: string) {
    const existing = await this.requireIncident(user, id);
    if (existing.status !== IncidentStatus.ACTION_ASSIGNED) {
      throw new BadRequestException('Case must have an assigned action before acknowledgment');
    }
    const incident = await this.prisma.disciplinaryIncident.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgmentNotes: notes?.trim() || null,
      },
      include: incidentInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.Acknowledged',
      resource: 'DisciplinaryIncident',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
    });
    return incident;
  }

  async close(user: AuthUser, id: string, notes?: string) {
    const existing = await this.requireIncident(user, id);
    this.assertSeverityDecision(user, existing.severity);
    if (
      existing.status !== IncidentStatus.ACTION_ASSIGNED &&
      existing.status !== IncidentStatus.AWAITING_DECISION &&
      existing.status !== IncidentStatus.APPEALED
    ) {
      throw new BadRequestException('Case cannot be closed from the current status');
    }
    const incident = await this.prisma.disciplinaryIncident.update({
      where: { id },
      data: {
        status: IncidentStatus.CLOSED,
        closedAt: new Date(),
        decidedById: existing.decidedById ?? user.id,
        decidedAt: existing.decidedAt ?? new Date(),
        ...(notes
          ? {
              decisionNotes: [existing.decisionNotes, notes.trim()]
                .filter(Boolean)
                .join('\n\n'),
            }
          : {}),
      },
      include: incidentInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.Closed',
      resource: 'DisciplinaryIncident',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      previousValue: { status: existing.status },
      newValue: { status: incident.status },
    });
    return incident;
  }

  async appeal(user: AuthUser, id: string, notes?: string) {
    const existing = await this.requireIncident(user, id);
    if (
      existing.status !== IncidentStatus.CLOSED &&
      existing.status !== IncidentStatus.ACTION_ASSIGNED
    ) {
      throw new BadRequestException('Only closed or action-assigned cases can be appealed');
    }
    const incident = await this.prisma.disciplinaryIncident.update({
      where: { id },
      data: {
        status: IncidentStatus.APPEALED,
        closedAt: null,
        ...(notes
          ? {
              decisionNotes: [existing.decisionNotes, `Appeal: ${notes.trim()}`]
                .filter(Boolean)
                .join('\n\n'),
            }
          : {}),
      },
      include: incidentInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Disciplinary.Appealed',
      resource: 'DisciplinaryIncident',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      previousValue: { status: existing.status },
      newValue: { status: incident.status },
    });
    return incident;
  }

  async completeAction(user: AuthUser, actionId: string) {
    const action = await this.prisma.disciplinaryAction.findFirst({
      where: { id: actionId },
      include: { incident: true },
    });
    if (!action || !assertOrgAccess(user, action.organizationId)) {
      throw new NotFoundException('Action not found');
    }
    if (!assertCampusAccess(user, action.incident.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    return this.prisma.disciplinaryAction.update({
      where: { id: actionId },
      data: {
        status: DisciplinaryActionStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: {
        actionType: true,
        assignedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async studentAlert(user: AuthUser, studentKey: string) {
    const student = await this.resolveStudent(user, studentKey);
    const openCases = await this.prisma.disciplinaryIncident.count({
      where: {
        studentId: student.id,
        deletedAt: null,
        status: { in: OPEN_STATUSES },
      },
    });
    const mealRestricted = await this.prisma.disciplinaryAction.count({
      where: {
        organizationId: student.organizationId,
        status: { in: ACTIVE_ACTION_STATUSES },
        actionType: { affectsMeals: true, deletedAt: null },
        incident: {
          studentId: student.id,
          deletedAt: null,
          status: { in: OPEN_STATUSES },
        },
      },
    });
    return {
      studentId: student.id,
      externalStudentId: student.studentId,
      hasOpenCase: openCases > 0,
      openCases,
      mealRestrictionActive: mealRestricted > 0,
    };
  }

  async summary(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const base: Prisma.DisciplinaryIncidentWhereInput = {
      deletedAt: null,
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
    };
    const dayStart = ethiopiaDayStartUtc(new Date());

    const [
      openCases,
      incidentsToday,
      highSeverityOpen,
      studentsUnderAction,
      typeGroups,
      thresholds,
    ] = await Promise.all([
      this.prisma.disciplinaryIncident.count({
        where: { ...base, status: { in: OPEN_STATUSES } },
      }),
      this.prisma.disciplinaryIncident.count({
        where: { ...base, occurredAt: { gte: dayStart } },
      }),
      this.prisma.disciplinaryIncident.count({
        where: {
          ...base,
          status: { in: OPEN_STATUSES },
          severity: { in: [IncidentSeverity.HIGH, IncidentSeverity.CRITICAL] },
        },
      }),
      this.prisma.disciplinaryIncident.findMany({
        where: {
          ...base,
          status: {
            in: [IncidentStatus.ACTION_ASSIGNED, IncidentStatus.APPEALED],
          },
        },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      this.prisma.disciplinaryIncident.groupBy({
        by: ['incidentTypeId'],
        where: base,
        _count: { _all: true },
        orderBy: { _count: { incidentTypeId: 'desc' } },
        take: 5,
      }),
      this.getRepeatThresholds(orgId),
    ]);

    const typeIds = typeGroups.map((g) => g.incidentTypeId);
    const types = typeIds.length
      ? await this.prisma.incidentType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true, category: true },
        })
      : [];
    const typeMap = new Map(types.map((t) => [t.id, t]));

    const repeatOffenders = await this.findRepeatOffenders(user, orgId, thresholds);

    return {
      openCases,
      studentsUnderAction: studentsUnderAction.length,
      incidentsToday,
      highSeverityOpen,
      repeatOffenders: repeatOffenders.length,
      repeatOffenderSamples: repeatOffenders.slice(0, 5),
      mostCommonTypes: typeGroups.map((g) => ({
        incidentTypeId: g.incidentTypeId,
        name: typeMap.get(g.incidentTypeId)?.name ?? 'Unknown',
        category: typeMap.get(g.incidentTypeId)?.category ?? '',
        count: g._count._all,
      })),
      thresholds,
    };
  }

  async reports(
    user: AuthUser,
    query: {
      organizationId?: string;
      from?: string;
      to?: string;
      campusId?: string;
      programId?: string;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    const campusFilter = resolveCampusId(user, query.campusId);
    const where: Prisma.DisciplinaryIncidentWhereInput = {
      deletedAt: null,
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(campusFilter ? { campusId: campusFilter } : {}),
      ...(query.programId ? { programId: query.programId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [byStatus, bySeverity, byCampus, byMentor, items] = await Promise.all([
      this.prisma.disciplinaryIncident.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.disciplinaryIncident.groupBy({
        by: ['severity'],
        where,
        _count: { _all: true },
      }),
      this.prisma.disciplinaryIncident.groupBy({
        by: ['campusId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { campusId: 'desc' } },
        take: 20,
      }),
      this.prisma.disciplinaryIncident.groupBy({
        by: ['reportedById'],
        where,
        _count: { _all: true },
        orderBy: { _count: { reportedById: 'desc' } },
        take: 20,
      }),
      this.prisma.disciplinaryIncident.findMany({
        where,
        include: incidentInclude,
        orderBy: { occurredAt: 'desc' },
        take: 500,
      }),
    ]);

    const campusIds = byCampus.map((r) => r.campusId);
    const mentorIds = byMentor.map((r) => r.reportedById);
    const [campuses, mentors] = await Promise.all([
      campusIds.length
        ? this.prisma.campus.findMany({
            where: { id: { in: campusIds } },
            select: { id: true, name: true, shortName: true },
          })
        : [],
      mentorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: mentorIds } },
            select: { id: true, fullName: true },
          })
        : [],
    ]);
    const campusMap = new Map(campuses.map((c) => [c.id, c]));
    const mentorMap = new Map(mentors.map((m) => [m.id, m]));

    return {
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      bySeverity: bySeverity.map((r) => ({
        severity: r.severity,
        count: r._count._all,
      })),
      byCampus: byCampus.map((r) => ({
        campusId: r.campusId,
        campus: campusMap.get(r.campusId) ?? null,
        count: r._count._all,
      })),
      byMentor: byMentor.map((r) => ({
        reportedById: r.reportedById,
        mentor: mentorMap.get(r.reportedById) ?? null,
        count: r._count._all,
      })),
      items,
      count: items.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async requireIncident(user: AuthUser, id: string) {
    const incident = await this.prisma.disciplinaryIncident.findFirst({
      where: { id, deletedAt: null },
    });
    if (!incident || !assertOrgAccess(user, incident.organizationId)) {
      throw new NotFoundException('Incident not found');
    }
    if (!assertCampusAccess(user, incident.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    return incident;
  }

  private assertSeverityDecision(user: AuthUser, severity: IncidentSeverity) {
    if (severity === IncidentSeverity.CRITICAL && !user.isSuperAdmin) {
      const elevated =
        user.roles.includes('Admin') || user.roles.includes('CampusCoordinator');
      if (!elevated) {
        throw new ForbiddenException(
          'Critical severity cases require Admin or Campus Coordinator decision',
        );
      }
    }
  }

  private async resolveStudent(user: AuthUser, studentKey: string) {
    const orgId = resolveActiveOrganizationId(user);
    const student = await this.prisma.student.findFirst({
      where: {
        deletedAt: null,
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
        ...(orgId ? { organizationId: orgId } : {}),
        OR: [{ id: studentKey }, { studentId: studentKey }, { barcode: studentKey }],
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  private async nextIncidentNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DI-${year}-`;
    const latest = await this.prisma.disciplinaryIncident.findFirst({
      where: {
        organizationId,
        incidentNumber: { startsWith: prefix },
      },
      orderBy: { incidentNumber: 'desc' },
      select: { incidentNumber: true },
    });
    let seq = 1;
    if (latest?.incidentNumber) {
      const part = latest.incidentNumber.slice(prefix.length);
      const n = Number.parseInt(part, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async getRepeatThresholds(organizationId?: string | null) {
    const keys = [
      'disciplinary.repeat_warning_count',
      'disciplinary.repeat_warning_days',
      'disciplinary.high_severity_repeat_count',
    ] as const;
    const rows = await this.prisma.businessRule.findMany({
      where: {
        key: { in: [...keys] },
        OR: [
          { scopeKey: '__platform__' },
          ...(organizationId ? [{ scopeKey: organizationId }] : []),
        ],
      },
    });
    const read = (key: (typeof keys)[number], fallback: number) => {
      const platform = rows.find((r) => r.key === key && r.scopeKey === '__platform__');
      const orgScoped = organizationId
        ? rows.find((r) => r.key === key && r.scopeKey === organizationId)
        : undefined;
      const raw = (orgScoped ?? platform)?.value;
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      warningCount: read('disciplinary.repeat_warning_count', 3),
      warningDays: read('disciplinary.repeat_warning_days', 30),
      highSeverityCount: read('disciplinary.high_severity_repeat_count', 2),
    };
  }

  private async findRepeatOffenders(
    user: AuthUser,
    organizationId: string | null | undefined,
    thresholds: { warningCount: number; warningDays: number; highSeverityCount: number },
  ) {
    const since = new Date();
    since.setDate(since.getDate() - thresholds.warningDays);

    const base: Prisma.DisciplinaryIncidentWhereInput = {
      deletedAt: null,
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...(organizationId ? { organizationId } : {}),
      occurredAt: { gte: since },
    };

    const grouped = await this.prisma.disciplinaryIncident.groupBy({
      by: ['studentId'],
      where: base,
      _count: { _all: true },
      having: { studentId: { _count: { gte: thresholds.warningCount } } },
    });

    const highGrouped = await this.prisma.disciplinaryIncident.groupBy({
      by: ['studentId'],
      where: {
        ...base,
        severity: { in: [IncidentSeverity.HIGH, IncidentSeverity.CRITICAL] },
      },
      _count: { _all: true },
      having: { studentId: { _count: { gte: thresholds.highSeverityCount } } },
    });

    const studentIds = Array.from(
      new Set([...grouped, ...highGrouped].map((g) => g.studentId)),
    );
    if (!studentIds.length) return [];

    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        studentId: true,
        fullName: true,
        campus: { select: { shortName: true, name: true } },
      },
    });
    const countMap = new Map(grouped.map((g) => [g.studentId, g._count._all]));
    const highMap = new Map(highGrouped.map((g) => [g.studentId, g._count._all]));

    return students.map((s) => ({
      ...s,
      incidentCount: countMap.get(s.id) ?? 0,
      highSeverityCount: highMap.get(s.id) ?? 0,
    }));
  }
}
