import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GateAction, LeaveRequestStatus, Prisma } from '@prisma/client';
import { ethiopiaDayStartUtc } from '../../common/timezone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  assertCampusAccess,
  assertOrgAccess,
  resolveActiveOrganizationId,
  resolveCampusId,
  scopeCampusFilter,
  scopeOrganizationFilter,
} from '../auth/auth.types';

const ACTIVE_LEAVE_STATUSES: LeaveRequestStatus[] = [
  LeaveRequestStatus.PENDING,
  LeaveRequestStatus.APPROVED,
  LeaveRequestStatus.CHECKED_OUT,
  LeaveRequestStatus.OVERDUE,
];

const leaveInclude = {
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
  leaveType: { select: { id: true, name: true, active: true } },
  campus: { select: { id: true, name: true, shortName: true } },
  program: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Leave types
  // ---------------------------------------------------------------------------

  async listTypes(user: AuthUser, organizationId?: string, activeOnly?: boolean) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException('Organization context required');
    }
    return this.prisma.leaveType.findMany({
      where: {
        deletedAt: null,
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createType(
    user: AuthUser,
    data: {
      organizationId: string;
      name: string;
      description?: string;
      sortOrder?: number;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }
    const type = await this.prisma.leaveType.create({
      data: {
        organizationId: data.organizationId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Leave.TypeCreated',
      resource: 'LeaveType',
      resourceId: type.id,
      organizationId: data.organizationId,
      newValue: type,
    });
    return type;
  }

  async updateType(
    user: AuthUser,
    id: string,
    data: {
      name?: string;
      description?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    const existing = await this.prisma.leaveType.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Leave type not found');
    }
    const type = await this.prisma.leaveType.update({
      where: { id },
      data: {
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
      action: 'Leave.TypeUpdated',
      resource: 'LeaveType',
      resourceId: id,
      organizationId: existing.organizationId,
      previousValue: existing,
      newValue: type,
    });
    return type;
  }

  async deleteType(user: AuthUser, id: string) {
    const existing = await this.prisma.leaveType.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { leaveRequests: true } } },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Leave type not found');
    }
    if (existing._count.leaveRequests > 0) {
      throw new BadRequestException(
        'Cannot delete leave type that has leave requests. Deactivate it instead.',
      );
    }
    const type = await this.prisma.leaveType.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Leave.TypeDeleted',
      resource: 'LeaveType',
      resourceId: id,
      organizationId: existing.organizationId,
      previousValue: existing,
      newValue: type,
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Leave requests
  // ---------------------------------------------------------------------------

  async list(
    user: AuthUser,
    query: {
      organizationId?: string;
      status?: LeaveRequestStatus;
      campusId?: string;
      studentId?: string;
      from?: string;
      to?: string;
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
    const page = query.page ?? Math.floor(skip / take) + 1;

    const where: Prisma.LeaveRequestWhereInput = {
      deletedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...(campusFilter !== undefined
        ? { campusId: campusFilter }
        : scopeCampusFilter(user)),
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...((query.from || query.to) && {
        expectedExitTime: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: leaveInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  async getById(user: AuthUser, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...leaveInclude,
        gateLogs: {
          orderBy: { scannedAt: 'desc' },
          include: {
            gateOfficer: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!leave || !assertOrgAccess(user, leave.organizationId)) {
      throw new NotFoundException('Leave request not found');
    }
    if (!assertCampusAccess(user, leave.campusId)) {
      throw new NotFoundException('Leave request not found');
    }
    return leave;
  }

  async create(
    user: AuthUser,
    dto: {
      organizationId: string;
      studentId: string;
      leaveTypeId: string;
      reason: string;
      destination: string;
      expectedExitTime: string;
      expectedReturnTime: string;
      notes?: string;
    },
  ) {
    if (!assertOrgAccess(user, dto.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }

    const student = await this.prisma.student.findFirst({
      where: {
        deletedAt: null,
        organizationId: dto.organizationId,
        OR: [{ id: dto.studentId }, { studentId: dto.studentId }],
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!assertCampusAccess(user, student.campusId)) {
      throw new ForbiddenException('Student campus not in your scope');
    }

    const leaveType = await this.prisma.leaveType.findFirst({
      where: {
        id: dto.leaveTypeId,
        organizationId: dto.organizationId,
        deletedAt: null,
        active: true,
      },
    });
    if (!leaveType) {
      throw new BadRequestException('Leave type not found or inactive');
    }

    const expectedExitTime = new Date(dto.expectedExitTime);
    const expectedReturnTime = new Date(dto.expectedReturnTime);
    if (
      Number.isNaN(expectedExitTime.getTime()) ||
      Number.isNaN(expectedReturnTime.getTime())
    ) {
      throw new BadRequestException('Invalid exit or return time');
    }
    if (expectedReturnTime <= expectedExitTime) {
      throw new BadRequestException('Expected return must be after expected exit');
    }

    const active = await this.prisma.leaveRequest.findFirst({
      where: {
        studentId: student.id,
        deletedAt: null,
        status: { in: ACTIVE_LEAVE_STATUSES },
      },
      select: { id: true, leaveNumber: true, status: true },
    });
    if (active) {
      throw new BadRequestException(
        `Student already has an active leave (${active.leaveNumber}, ${active.status})`,
      );
    }

    const leaveNumber = await this.nextLeaveNumber(dto.organizationId);
    const leave = await this.prisma.leaveRequest.create({
      data: {
        organizationId: dto.organizationId,
        leaveNumber,
        studentId: student.id,
        campusId: student.campusId,
        programId: student.programId,
        leaveTypeId: leaveType.id,
        reason: dto.reason.trim(),
        destination: dto.destination.trim(),
        expectedExitTime,
        expectedReturnTime,
        notes: dto.notes?.trim() || null,
        status: LeaveRequestStatus.PENDING,
        createdById: user.id,
      },
      include: leaveInclude,
    });

    await this.audit.log({
      userId: user.id,
      action: 'Leave.Created',
      resource: 'LeaveRequest',
      resourceId: leave.id,
      organizationId: leave.organizationId,
      campusId: leave.campusId,
      newValue: leave,
    });
    return leave;
  }

  async update(
    user: AuthUser,
    id: string,
    dto: {
      leaveTypeId?: string;
      reason?: string;
      destination?: string;
      expectedExitTime?: string;
      expectedReturnTime?: string;
      notes?: string;
    },
  ) {
    const existing = await this.requireLeave(user, id);
    if (existing.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Only pending leave requests can be updated');
    }

    let leaveTypeId = existing.leaveTypeId;
    if (dto.leaveTypeId) {
      const leaveType = await this.prisma.leaveType.findFirst({
        where: {
          id: dto.leaveTypeId,
          organizationId: existing.organizationId,
          deletedAt: null,
          active: true,
        },
      });
      if (!leaveType) {
        throw new BadRequestException('Leave type not found or inactive');
      }
      leaveTypeId = leaveType.id;
    }

    const expectedExitTime = dto.expectedExitTime
      ? new Date(dto.expectedExitTime)
      : existing.expectedExitTime;
    const expectedReturnTime = dto.expectedReturnTime
      ? new Date(dto.expectedReturnTime)
      : existing.expectedReturnTime;
    if (
      Number.isNaN(expectedExitTime.getTime()) ||
      Number.isNaN(expectedReturnTime.getTime())
    ) {
      throw new BadRequestException('Invalid exit or return time');
    }
    if (expectedReturnTime <= expectedExitTime) {
      throw new BadRequestException('Expected return must be after expected exit');
    }

    const leave = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        leaveTypeId,
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() } : {}),
        ...(dto.destination !== undefined
          ? { destination: dto.destination.trim() }
          : {}),
        expectedExitTime,
        expectedReturnTime,
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: leaveInclude,
    });

    await this.audit.log({
      userId: user.id,
      action: 'Leave.Updated',
      resource: 'LeaveRequest',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      previousValue: existing,
      newValue: leave,
    });
    return leave;
  }

  async approve(user: AuthUser, id: string) {
    const existing = await this.requireLeave(user, id);
    if (existing.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Only pending leave requests can be approved');
    }
    const leave = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      include: leaveInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Leave.Approved',
      resource: 'LeaveRequest',
      resourceId: id,
      organizationId: leave.organizationId,
      campusId: leave.campusId,
      previousValue: { status: existing.status },
      newValue: { status: leave.status, approvedById: user.id },
    });
    return leave;
  }

  async reject(user: AuthUser, id: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }
    const existing = await this.requireLeave(user, id);
    if (existing.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException('Only pending leave requests can be rejected');
    }
    const leave = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.REJECTED,
        rejectionReason: reason.trim(),
        approvedById: user.id,
        approvedAt: new Date(),
      },
      include: leaveInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Leave.Rejected',
      resource: 'LeaveRequest',
      resourceId: id,
      organizationId: leave.organizationId,
      campusId: leave.campusId,
      previousValue: { status: existing.status },
      newValue: { status: leave.status, rejectionReason: leave.rejectionReason },
    });
    return leave;
  }

  async cancel(user: AuthUser, id: string) {
    const existing = await this.requireLeave(user, id);
    if (
      existing.status !== LeaveRequestStatus.PENDING &&
      existing.status !== LeaveRequestStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Only pending or approved leave requests can be cancelled',
      );
    }
    const leave = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: LeaveRequestStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: user.id,
      },
      include: leaveInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Leave.Cancelled',
      resource: 'LeaveRequest',
      resourceId: id,
      organizationId: leave.organizationId,
      campusId: leave.campusId,
      previousValue: { status: existing.status },
      newValue: { status: leave.status },
    });
    return leave;
  }

  async listForStudent(user: AuthUser, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: studentId }, { studentId }],
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    return this.prisma.leaveRequest.findMany({
      where: {
        studentId: student.id,
        deletedAt: null,
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
      },
      include: leaveInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async markOverdue(user?: AuthUser, organizationId?: string) {
    const now = new Date();
    const orgId = user
      ? resolveActiveOrganizationId(user, organizationId)
      : organizationId ?? null;

    const where: Prisma.LeaveRequestWhereInput = {
      deletedAt: null,
      status: LeaveRequestStatus.CHECKED_OUT,
      expectedReturnTime: { lt: now },
      ...(orgId ? { organizationId: orgId } : {}),
      ...(user ? scopeOrganizationFilter(user) : {}),
      ...(user ? scopeCampusFilter(user) : {}),
    };

    const result = await this.prisma.leaveRequest.updateMany({
      where,
      data: { status: LeaveRequestStatus.OVERDUE },
    });
    return { updated: result.count };
  }

  async summary(user: AuthUser, organizationId?: string) {
    await this.markOverdue(user, organizationId);
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const dayStart = ethiopiaDayStartUtc();
    const base: Prisma.LeaveRequestWhereInput = {
      deletedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
    };
    const gateBase: Prisma.GateLogWhereInput = {
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
    };

    const [
      outside,
      returnedToday,
      pending,
      approvedToday,
      rejectedToday,
      overdue,
      returnedWithDuration,
      topTypes,
      recentGateActivity,
    ] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: { ...base, status: LeaveRequestStatus.CHECKED_OUT },
      }),
      this.prisma.leaveRequest.count({
        where: {
          ...base,
          status: LeaveRequestStatus.RETURNED,
          actualReturnTime: { gte: dayStart },
        },
      }),
      this.prisma.leaveRequest.count({
        where: { ...base, status: LeaveRequestStatus.PENDING },
      }),
      this.prisma.leaveRequest.count({
        where: {
          ...base,
          approvedAt: { gte: dayStart },
          status: {
            in: [
              LeaveRequestStatus.APPROVED,
              LeaveRequestStatus.CHECKED_OUT,
              LeaveRequestStatus.RETURNED,
              LeaveRequestStatus.OVERDUE,
            ],
          },
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          ...base,
          status: LeaveRequestStatus.REJECTED,
          updatedAt: { gte: dayStart },
        },
      }),
      this.prisma.leaveRequest.count({
        where: { ...base, status: LeaveRequestStatus.OVERDUE },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          ...base,
          status: LeaveRequestStatus.RETURNED,
          actualExitTime: { not: null },
          actualReturnTime: { not: null },
        },
        select: { actualExitTime: true, actualReturnTime: true },
        take: 500,
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['leaveTypeId'],
        where: base,
        _count: { _all: true },
        orderBy: { _count: { leaveTypeId: 'desc' } },
        take: 1,
      }),
      this.prisma.gateLog.findMany({
        where: gateBase,
        orderBy: { scannedAt: 'desc' },
        take: 10,
        include: {
          student: {
            select: { id: true, studentId: true, fullName: true },
          },
          leaveRequest: {
            select: { id: true, leaveNumber: true, status: true },
          },
          gateOfficer: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    let avgDurationMinutes: number | null = null;
    if (returnedWithDuration.length > 0) {
      const totalMinutes = returnedWithDuration.reduce((sum, row) => {
        if (!row.actualExitTime || !row.actualReturnTime) return sum;
        return (
          sum +
          (row.actualReturnTime.getTime() - row.actualExitTime.getTime()) / 60_000
        );
      }, 0);
      avgDurationMinutes = Math.round(totalMinutes / returnedWithDuration.length);
    }

    let topLeaveType: { id: string; name: string; count: number } | null = null;
    if (topTypes[0]) {
      const type = await this.prisma.leaveType.findUnique({
        where: { id: topTypes[0].leaveTypeId },
        select: { id: true, name: true },
      });
      if (type) {
        topLeaveType = {
          id: type.id,
          name: type.name,
          count: topTypes[0]._count._all,
        };
      }
    }

    return {
      outside,
      returnedToday,
      pending,
      approvedToday,
      rejectedToday,
      overdue,
      avgDurationMinutes,
      topLeaveType,
      recentGateActivity,
    };
  }

  // ---------------------------------------------------------------------------
  // Gate
  // ---------------------------------------------------------------------------

  async resolveStudentByScan(user: AuthUser, barcode: string, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException(
        'Organization context required. Sign out and sign in again.',
      );
    }
    if (!user.isSuperAdmin && user.campusIds.length === 0) {
      throw new ForbiddenException(
        'No campus assigned to your account. Ask an admin to assign your campus, then sign in again.',
      );
    }

    const orgScope = {
      deletedAt: null as null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
    };
    const scope = {
      ...orgScope,
      ...scopeCampusFilter(user),
    };
    const include = { campus: true, program: true } as const;
    const key = barcode.trim();
    if (!key) throw new BadRequestException('barcode is required');

    let student = await this.prisma.student.findFirst({
      where: {
        ...scope,
        OR: [
          { barcode: { equals: key, mode: 'insensitive' } },
          { studentId: { equals: key, mode: 'insensitive' } },
        ],
      },
      include,
    });

    if (!student) {
      const short = key.replace(/^#+/, '');
      const looksShort =
        short.length >= 3 &&
        short.length <= 12 &&
        !short.includes('-') &&
        /^[A-Za-z0-9]+$/.test(short);

      if (looksShort) {
        const candidates = await this.prisma.student.findMany({
          where: {
            ...scope,
            OR: [
              { studentId: { contains: `-${short}-`, mode: 'insensitive' } },
              { barcode: { contains: `-${short}-`, mode: 'insensitive' } },
              { studentId: { endsWith: `-${short}`, mode: 'insensitive' } },
              { barcode: { endsWith: `-${short}`, mode: 'insensitive' } },
              { studentId: { startsWith: `${short}-`, mode: 'insensitive' } },
              { barcode: { startsWith: `${short}-`, mode: 'insensitive' } },
            ],
          },
          include,
          take: 6,
        });
        if (candidates.length === 1) {
          student = candidates[0];
        } else if (candidates.length > 1) {
          const samples = candidates
            .slice(0, 3)
            .map((c) => c.studentId)
            .join(', ');
          throw new BadRequestException(
            `Multiple students match "${short}" (${samples}). Use the full ID.`,
          );
        }
      }
    }

    if (!student) {
      const outside = await this.prisma.student.findFirst({
        where: {
          ...orgScope,
          OR: [
            { barcode: { equals: key, mode: 'insensitive' } },
            { studentId: { equals: key, mode: 'insensitive' } },
          ],
        },
        select: {
          studentId: true,
          campus: { select: { shortName: true, name: true } },
        },
      });
      if (outside) {
        const campusLabel =
          outside.campus?.shortName || outside.campus?.name || 'another campus';
        throw new ForbiddenException(
          `Student ${outside.studentId} belongs to ${campusLabel}, which is outside your campus access.`,
        );
      }
      throw new NotFoundException('Student Not Found');
    }
    return student;
  }

  async exit(
    user: AuthUser,
    input: { barcode: string; gateLocation?: string; organizationId?: string },
  ) {
    const student = await this.resolveStudentByScan(
      user,
      input.barcode,
      input.organizationId,
    );

    const leaveScope: Prisma.LeaveRequestWhereInput = {
      studentId: student.id,
      deletedAt: null,
      organizationId: student.organizationId,
      campusId: student.campusId,
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
    };

    const alreadyOutside = await this.prisma.leaveRequest.findFirst({
      where: {
        ...leaveScope,
        status: {
          in: [LeaveRequestStatus.CHECKED_OUT, LeaveRequestStatus.OVERDUE],
        },
      },
      include: leaveInclude,
    });
    if (alreadyOutside) {
      return {
        allowed: false as const,
        reason: 'Already Outside',
        student,
        leave: alreadyOutside,
      };
    }

    const approved = await this.prisma.leaveRequest.findFirst({
      where: {
        ...leaveScope,
        status: LeaveRequestStatus.APPROVED,
      },
      include: leaveInclude,
      orderBy: { expectedExitTime: 'asc' },
    });

    if (!approved) {
      const latest = await this.prisma.leaveRequest.findFirst({
        where: leaveScope,
        orderBy: { createdAt: 'desc' },
        select: { status: true, leaveNumber: true },
      });
      let reason = 'No Approved Leave';
      if (latest?.status === LeaveRequestStatus.CANCELLED) {
        reason = 'Leave Cancelled';
      } else if (
        latest?.status === LeaveRequestStatus.EXPIRED ||
        latest?.status === LeaveRequestStatus.RETURNED
      ) {
        reason = 'Leave Expired';
      } else if (latest?.status === LeaveRequestStatus.PENDING) {
        reason = 'Leave Pending Approval';
      } else if (latest?.status === LeaveRequestStatus.REJECTED) {
        reason = 'Leave Rejected';
      }
      return { allowed: false as const, reason, student };
    }

    const now = new Date();
    const earliestExit = new Date(approved.expectedExitTime.getTime() - 2 * 60 * 60 * 1000);
    if (now < earliestExit) {
      return {
        allowed: false as const,
        reason: 'Too Early',
        student,
        leave: approved,
      };
    }
    if (now > approved.expectedReturnTime) {
      return {
        allowed: false as const,
        reason: 'Expired',
        student,
        leave: approved,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const gateLog = await tx.gateLog.create({
        data: {
          organizationId: approved.organizationId,
          leaveRequestId: approved.id,
          studentId: student.id,
          campusId: student.campusId,
          action: GateAction.EXIT,
          gateOfficerId: user.id,
          gateLocation: input.gateLocation?.trim() || null,
          scannedAt: now,
        },
      });
      const leave = await tx.leaveRequest.update({
        where: { id: approved.id },
        data: {
          status: LeaveRequestStatus.CHECKED_OUT,
          actualExitTime: now,
        },
        include: leaveInclude,
      });
      return { gateLog, leave };
    });

    await this.audit.log({
      userId: user.id,
      action: 'Leave.Exit',
      resource: 'LeaveRequest',
      resourceId: result.leave.id,
      organizationId: result.leave.organizationId,
      campusId: result.leave.campusId,
      newValue: {
        status: result.leave.status,
        actualExitTime: result.leave.actualExitTime,
        gateLogId: result.gateLog.id,
      },
    });

    return {
      allowed: true as const,
      leave: result.leave,
      student,
      exitTime: result.leave.actualExitTime,
    };
  }

  async returnScan(
    user: AuthUser,
    input: { barcode: string; gateLocation?: string; organizationId?: string },
  ) {
    const student = await this.resolveStudentByScan(
      user,
      input.barcode,
      input.organizationId,
    );

    const active = await this.prisma.leaveRequest.findFirst({
      where: {
        studentId: student.id,
        deletedAt: null,
        organizationId: student.organizationId,
        status: {
          in: [LeaveRequestStatus.CHECKED_OUT, LeaveRequestStatus.OVERDUE],
        },
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
      },
      include: leaveInclude,
    });

    if (!active) {
      return {
        allowed: false as const,
        reason: 'No Active Exit Found',
        student,
      };
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const gateLog = await tx.gateLog.create({
        data: {
          organizationId: active.organizationId,
          leaveRequestId: active.id,
          studentId: student.id,
          campusId: student.campusId,
          action: GateAction.RETURN,
          gateOfficerId: user.id,
          gateLocation: input.gateLocation?.trim() || null,
          scannedAt: now,
        },
      });
      const leave = await tx.leaveRequest.update({
        where: { id: active.id },
        data: {
          status: LeaveRequestStatus.RETURNED,
          actualReturnTime: now,
        },
        include: leaveInclude,
      });
      return { gateLog, leave };
    });

    const exitTime = result.leave.actualExitTime ?? active.actualExitTime ?? now;
    const durationMinutes = Math.max(
      0,
      Math.round((now.getTime() - exitTime.getTime()) / 60_000),
    );

    await this.audit.log({
      userId: user.id,
      action: 'Leave.Return',
      resource: 'LeaveRequest',
      resourceId: result.leave.id,
      organizationId: result.leave.organizationId,
      campusId: result.leave.campusId,
      newValue: {
        status: result.leave.status,
        actualReturnTime: result.leave.actualReturnTime,
        durationMinutes,
        gateLogId: result.gateLog.id,
      },
    });

    return {
      allowed: true as const,
      leave: result.leave,
      student,
      durationMinutes,
    };
  }

  async currentOutside(user: AuthUser, organizationId?: string) {
    await this.markOverdue(user, organizationId);
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.prisma.leaveRequest.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [LeaveRequestStatus.CHECKED_OUT, LeaveRequestStatus.OVERDUE],
        },
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
      },
      include: leaveInclude,
      orderBy: { actualExitTime: 'asc' },
    });
  }

  async overdue(user: AuthUser, organizationId?: string) {
    await this.markOverdue(user, organizationId);
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.prisma.leaveRequest.findMany({
      where: {
        deletedAt: null,
        status: LeaveRequestStatus.OVERDUE,
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
        ...scopeCampusFilter(user),
      },
      include: leaveInclude,
      orderBy: { expectedReturnTime: 'asc' },
    });
  }

  async history(
    user: AuthUser,
    query: {
      organizationId?: string;
      campusId?: string;
      studentId?: string;
      action?: GateAction;
      from?: string;
      to?: string;
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
    const page = query.page ?? Math.floor(skip / take) + 1;

    const where: Prisma.GateLogWhereInput = {
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...(campusFilter !== undefined
        ? { campusId: campusFilter }
        : scopeCampusFilter(user)),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...((query.from || query.to) && {
        scannedAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.gateLog.findMany({
        where,
        orderBy: { scannedAt: 'desc' },
        skip,
        take,
        include: {
          student: {
            select: { id: true, studentId: true, fullName: true, barcode: true },
          },
          leaveRequest: {
            select: {
              id: true,
              leaveNumber: true,
              status: true,
              destination: true,
            },
          },
          gateOfficer: { select: { id: true, fullName: true } },
          campus: { select: { id: true, name: true, shortName: true } },
        },
      }),
      this.prisma.gateLog.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  /** Used by meals module to block serving while student is outside. */
  async findActiveOutsideLeave(studentId: string) {
    return this.prisma.leaveRequest.findFirst({
      where: {
        studentId,
        deletedAt: null,
        status: {
          in: [LeaveRequestStatus.CHECKED_OUT, LeaveRequestStatus.OVERDUE],
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async requireLeave(user: AuthUser, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id, deletedAt: null },
    });
    if (!leave || !assertOrgAccess(user, leave.organizationId)) {
      throw new NotFoundException('Leave request not found');
    }
    if (!assertCampusAccess(user, leave.campusId)) {
      throw new NotFoundException('Leave request not found');
    }
    return leave;
  }

  private async nextLeaveNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `LV-${year}-`;
    const latest = await this.prisma.leaveRequest.findFirst({
      where: {
        organizationId,
        leaveNumber: { startsWith: prefix },
      },
      orderBy: { leaveNumber: 'desc' },
      select: { leaveNumber: true },
    });
    let seq = 1;
    if (latest?.leaveNumber) {
      const part = latest.leaveNumber.slice(prefix.length);
      const n = Number.parseInt(part, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
}
