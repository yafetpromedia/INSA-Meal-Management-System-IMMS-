import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  assertOrgAccess,
  resolveActiveOrganizationId,
  scopeCampusFilter,
  scopeOrganizationFilter,
  scopeProgramFilter,
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
      skip?: number;
      take?: number;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    const where = {
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
      ...scopeProgramFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
      ...(query.campusId ? { campusId: query.campusId } : {}),
      ...(query.programId ? { programId: query.programId } : {}),
      ...(query.department ? { department: query.department } : {}),
      ...(query.search
        ? {
            OR: [
              { studentId: { contains: query.search, mode: 'insensitive' as const } },
              { barcode: { contains: query.search, mode: 'insensitive' as const } },
              { fullName: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: { campus: true, program: true, organization: true },
        orderBy: { fullName: 'asc' },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 200),
      }),
      this.prisma.student.count({ where }),
    ]);
    return { items, total };
  }

  async getByBarcode(user: AuthUser, barcode: string, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const student = await this.prisma.student.findFirst({
      where: {
        barcode,
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
      },
      include: { campus: true, program: true, academicYear: true, organization: true },
    });
    if (!student) throw new NotFoundException('Student Not Found');
    if (!user.isSuperAdmin && !user.campusIds.includes(student.campusId)) {
      throw new NotFoundException('Student Not Found');
    }
    if (
      user.programIds.length &&
      !user.isSuperAdmin &&
      !user.programIds.includes(student.programId)
    ) {
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
    data: Partial<{ fullName: string; department: string; status: StudentStatus }>,
  ) {
    const existing = await this.prisma.student.findUnique({ where: { id } });
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
