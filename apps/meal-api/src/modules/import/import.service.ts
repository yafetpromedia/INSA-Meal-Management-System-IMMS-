import { Injectable, NotFoundException } from '@nestjs/common';
import { ImportJobStatus, ImportMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  assertOrgAccess,
  resolveActiveOrganizationId,
  scopeOrganizationFilter,
} from '../auth/auth.types';

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  history(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    return this.prisma.importJob.findMany({
      where: {
        ...scopeOrganizationFilter(user),
        ...(orgId ? { organizationId: orgId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createStubJob(
    user: AuthUser,
    data: {
      organizationId: string;
      originalFile: string;
      campusId?: string;
      mode?: ImportMode;
    },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    return this.prisma.importJob.create({
      data: {
        organizationId: data.organizationId,
        uploadedById: user.id,
        originalFile: data.originalFile,
        campusId: data.campusId,
        mode: data.mode ?? ImportMode.ADD_ONLY,
        status: ImportJobStatus.PENDING,
      },
    });
  }
}
