import { Injectable, NotFoundException } from '@nestjs/common';
import { ProgramStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  assertCampusAccess,
  assertOrgAccess,
  resolveActiveOrganizationId,
  scopeOrganizationFilter,
} from '../auth/auth.types';

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, campusId?: string, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (campusId && !assertCampusAccess(user, campusId)) {
      return [];
    }
    return this.prisma.program.findMany({
      where: {
        deletedAt: null,
        ...scopeOrganizationFilter(user),
        ...(orgId ? { organizationId: orgId } : {}),
        ...(user.isSuperAdmin
          ? campusId
            ? { campusId }
            : {}
          : { campusId: campusId ?? { in: user.campusIds } }),
      },
      include: { campus: true, academicYear: true, organization: true },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const program = await this.prisma.program.findUnique({
      where: { id },
      include: { campus: true, academicYear: true, organization: true },
    });
    if (!program) throw new NotFoundException('Program not found');
    if (!assertOrgAccess(user, program.organizationId)) {
      throw new NotFoundException('Program not found');
    }
    if (!user.isSuperAdmin && !user.campusIds.includes(program.campusId)) {
      throw new NotFoundException('Program not found');
    }
    return program;
  }

  async create(
    user: AuthUser,
    data: {
      organizationId: string;
      name: string;
      campusId: string;
      academicYearId: string;
      capacity?: number;
      description?: string;
      startDate?: string;
      endDate?: string;
      coordinatorId?: string;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    const campus = await this.prisma.campus.findUnique({ where: { id: data.campusId } });
    if (!campus || campus.organizationId !== data.organizationId) {
      throw new NotFoundException('Campus not found');
    }

    const program = await this.prisma.program.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        campusId: data.campusId,
        academicYearId: data.academicYearId,
        capacity: data.capacity,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        coordinatorId: data.coordinatorId,
        createdById: user.id,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Program.Create',
      resource: 'Program',
      resourceId: program.id,
      organizationId: program.organizationId,
      campusId: program.campusId,
      programId: program.id,
      newValue: program,
    });
    return program;
  }

  async update(
    user: AuthUser,
    id: string,
    data: Partial<{ name: string; capacity: number; description: string; status: ProgramStatus }>,
  ) {
    await this.get(user, id);
    return this.prisma.program.update({
      where: { id },
      data: { ...data, updatedById: user.id },
    });
  }

  async archive(user: AuthUser, id: string) {
    await this.get(user, id);
    return this.prisma.program.update({
      where: { id },
      data: {
        status: ProgramStatus.ARCHIVED,
        deletedAt: new Date(),
        updatedById: user.id,
      },
    });
  }
}
