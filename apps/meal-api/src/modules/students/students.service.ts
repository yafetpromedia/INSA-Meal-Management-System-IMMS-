import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  assertCampusAccess,
  assertOrgAccess,
  assertProgramAccess,
  resolveActiveOrganizationId,
  resolveCampusId,
  resolveProgramId,
  scopeCampusFilter,
  scopeOrganizationFilter,
} from '../auth/auth.types';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    query: {
      search?: string;
      organizationId?: string;
      campusId?: string;
      programId?: string;
      department?: string;
      status?: StudentStatus;
      sort?: string;
      order?: 'asc' | 'desc';
      skip?: number;
      take?: number;
      page?: number;
      limit?: number;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    if (query.organizationId && !orgId) {
      throw new NotFoundException('Organization not found');
    }
    const campusFilter = resolveCampusId(user, query.campusId);
    if (query.campusId && campusFilter === undefined && !user.isSuperAdmin) {
      throw new NotFoundException('Campus not found');
    }
    const programFilter = resolveProgramId(user, query.programId);
    if (query.programId && programFilter === undefined && !user.isSuperAdmin) {
      throw new NotFoundException('Program not found');
    }
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? query.limit ?? 20, 200);
    const page = query.page ?? Math.floor(skip / take) + 1;
    const order = query.order === 'desc' ? 'desc' : 'asc';
    const sortField =
      query.sort === 'studentId' ||
      query.sort === 'fullName' ||
      query.sort === 'department' ||
      query.sort === 'barcode'
        ? query.sort
        : 'fullName';

    const where = {
      deletedAt: null,
      ...scopeOrganizationFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(campusFilter !== undefined ? { campusId: campusFilter } : {}),
      ...(programFilter !== undefined ? { programId: programFilter } : {}),
      ...(query.department ? { department: query.department } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { studentId: { contains: query.search, mode: 'insensitive' as const } },
              { barcode: { contains: query.search, mode: 'insensitive' as const } },
              { fullName: { contains: query.search, mode: 'insensitive' as const } },
              { department: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: { campus: true, program: true, organization: true },
        orderBy: { [sortField]: order },
        skip,
        take,
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items, total, page, limit: take };
  }

  search(
    user: AuthUser,
    q: string,
    organizationId?: string,
    page?: number,
    limit?: number,
  ) {
    return this.list(user, {
      search: q,
      organizationId,
      page,
      limit,
      skip: page && limit ? (page - 1) * limit : 0,
      take: limit,
    });
  }

  async getById(user: AuthUser, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: { campus: true, program: true, academicYear: true, organization: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (!assertOrgAccess(user, student.organizationId)) {
      throw new NotFoundException('Student not found');
    }
    if (!user.isSuperAdmin && !user.campusIds.includes(student.campusId)) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  /** Permanently remove a student and related operational records. */
  async remove(user: AuthUser, id: string) {
    const existing = await this.getById(user, id);

    await this.prisma.$transaction(async (tx) => {
      const incidentIds = (
        await tx.disciplinaryIncident.findMany({
          where: { studentId: id },
          select: { id: true },
        })
      ).map((r) => r.id);

      if (incidentIds.length) {
        await tx.disciplinaryAction.deleteMany({
          where: { incidentId: { in: incidentIds } },
        });
        await tx.disciplinaryIncident.deleteMany({ where: { studentId: id } });
      }

      await tx.activityParticipant.deleteMany({ where: { studentId: id } });
      await tx.mealRecord.deleteMany({ where: { studentId: id } });
      await tx.gateLog.deleteMany({ where: { studentId: id } });
      await tx.leaveRequest.deleteMany({ where: { studentId: id } });
      await tx.student.delete({ where: { id } });
    });

    await this.audit.log({
      userId: user.id,
      action: 'Student.DeletePermanent',
      resource: 'Student',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
      programId: existing.programId,
      previousValue: {
        studentId: existing.studentId,
        fullName: existing.fullName,
        barcode: existing.barcode,
      },
    });
    return { success: true };
  }

  async getByBarcode(user: AuthUser, barcode: string, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
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
      ...(user.programIds.length && !user.isSuperAdmin
        ? { programId: { in: user.programIds } }
        : {}),
    };
    const include = {
      campus: true,
      program: true,
      academicYear: true,
      organization: true,
    } as const;

    const key = barcode.trim();
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
        if (candidates.length === 1) student = candidates[0];
        else if (candidates.length > 1) {
          throw new BadRequestException(
            `Multiple students match "${short}". Use the full ID.`,
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
        select: { studentId: true, campus: { select: { shortName: true, name: true } } },
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

  async create(
    user: AuthUser,
    data: {
      organizationId: string;
      studentId: string;
      fullName: string;
      campusId: string;
      programId: string;
      academicYearId: string;
      gender?: string;
      department?: string;
      educationLevel?: string;
      email?: string;
      phone?: string;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    if (!assertCampusAccess(user, data.campusId)) {
      throw new NotFoundException('Campus not found');
    }
    if (!assertProgramAccess(user, data.programId)) {
      throw new NotFoundException('Program not found');
    }
    const campus = await this.prisma.campus.findUnique({ where: { id: data.campusId } });
    if (!campus || campus.organizationId !== data.organizationId) {
      throw new BadRequestException('Campus does not belong to organization');
    }

    const existing = await this.prisma.student.findUnique({
      where: {
        organizationId_studentId: {
          organizationId: data.organizationId,
          studentId: data.studentId,
        },
      },
    });
    if (existing) throw new BadRequestException('Student ID already exists in this organization');

    const student = await this.prisma.student.create({
      data: {
        ...data,
        barcode: data.studentId,
        createdById: user.id,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Student.Create',
      resource: 'Student',
      resourceId: student.id,
      organizationId: student.organizationId,
      campusId: student.campusId,
      programId: student.programId,
      newValue: student,
    });
    return student;
  }

  async update(
    user: AuthUser,
    id: string,
    data: Partial<{
      fullName: string;
      department: string;
      gender: string;
      educationLevel: string;
      email: string;
      phone: string;
      status: StudentStatus;
    }>,
  ) {
    const existing = await this.prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Student not found');
    if (!assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Student not found');
    }
    if (!user.isSuperAdmin && !user.campusIds.includes(existing.campusId)) {
      throw new NotFoundException('Student not found');
    }
    return this.prisma.student.update({
      where: { id },
      data: { ...data, updatedById: user.id },
    });
  }
}
