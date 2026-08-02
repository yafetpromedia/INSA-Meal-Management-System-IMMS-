import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityReportStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
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

const MAX_UPLOAD_BYTES = Number(process.env.ACTIVITY_MAX_UPLOAD_BYTES ?? 12 * 1024 * 1024);
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/webm',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/mp3',
]);

function statusIn(status: ActivityReportStatus, allowed: ActivityReportStatus[]) {
  return allowed.includes(status);
}

const reportInclude: Prisma.ActivityReportInclude = {
  category: { select: { id: true, name: true, active: true } },
  campus: { select: { id: true, name: true, shortName: true } },
  program: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  submittedBy: { select: { id: true, fullName: true } },
  reviewedBy: { select: { id: true, fullName: true } },
  media: {
    orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'asc' }],
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  },
  participants: {
    include: {
      student: {
        select: { id: true, studentId: true, fullName: true },
      },
    },
  },
  _count: { select: { media: true, participants: true } },
};

@Injectable()
export class ActivityService {
  private readonly uploadRoot = join(
    process.cwd(),
    process.env.UPLOAD_DIR ?? 'uploads',
    'activity',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    mkdirSync(this.uploadRoot, { recursive: true });
  }

  // Categories ----------------------------------------------------------------

  async listCategories(user: AuthUser, organizationId?: string, activeOnly?: boolean) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException('Organization context required');
    }
    return this.prisma.activityCategory.findMany({
      where: {
        deletedAt: null,
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(
    user: AuthUser,
    data: { organizationId: string; name: string; description?: string; sortOrder?: number },
  ) {
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }
    const row = await this.prisma.activityCategory.create({
      data: {
        organizationId: data.organizationId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Activity.CategoryCreated',
      resource: 'ActivityCategory',
      resourceId: row.id,
      organizationId: data.organizationId,
      newValue: row,
    });
    return row;
  }

  async updateCategory(
    user: AuthUser,
    id: string,
    data: { name?: string; description?: string; active?: boolean; sortOrder?: number },
  ) {
    const existing = await this.prisma.activityCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Category not found');
    }
    const row = await this.prisma.activityCategory.update({
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
    return row;
  }

  async deleteCategory(user: AuthUser, id: string) {
    const existing = await this.prisma.activityCategory.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { reports: true } } },
    });
    if (!existing || !assertOrgAccess(user, existing.organizationId)) {
      throw new NotFoundException('Category not found');
    }
    if (existing._count.reports > 0) {
      throw new BadRequestException('Cannot delete category with reports. Deactivate it instead.');
    }
    await this.prisma.activityCategory.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { success: true };
  }

  /** Dropdown data for create/edit — only needs Activity.Create / Activity.View. */
  async formOptions(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    if (!orgId && !user.isSuperAdmin) {
      throw new BadRequestException('Organization context required');
    }

    const orgFilter = {
      deletedAt: null as null,
      ...scopeOrganizationFilter(user),
      ...(orgId ? { organizationId: orgId } : {}),
    };

    const campusScope = user.isSuperAdmin
      ? {}
      : { id: { in: user.campusIds.length ? user.campusIds : ['__none__'] } };

    const [categories, campuses, programs, academicYears] = await Promise.all([
      this.prisma.activityCategory.findMany({
        where: { ...orgFilter, active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, description: true, active: true, sortOrder: true },
      }),
      this.prisma.campus.findMany({
        where: { ...orgFilter, ...campusScope },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, shortName: true },
      }),
      this.prisma.program.findMany({
        where: {
          ...orgFilter,
          ...(user.isSuperAdmin
            ? {}
            : { campusId: { in: user.campusIds.length ? user.campusIds : ['__none__'] } }),
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, campusId: true },
      }),
      this.prisma.academicYear.findMany({
        where: orgFilter,
        orderBy: { name: 'desc' },
        select: { id: true, name: true, isCurrent: true, isActive: true },
      }),
    ]);

    return { categories, campuses, programs, academicYears };
  }

  // Reports -------------------------------------------------------------------

  async list(
    user: AuthUser,
    query: {
      organizationId?: string;
      status?: ActivityReportStatus;
      campusId?: string;
      categoryId?: string;
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
      (user.roles.includes('Mentor') && !hasPermission(user, 'Activity.Approve'));

    const where: Prisma.ActivityReportWhereInput = {
      deletedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...(campusFilter !== undefined
        ? { campusId: campusFilter }
        : scopeCampusFilter(user)),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(mentorOnly ? { submittedById: user.id } : {}),
      ...(query.from || query.to
        ? {
            reportDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.activityReport.findMany({
        where,
        include: reportInclude,
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.activityReport.count({ where }),
    ]);
    return { items, total, page: query.page ?? Math.floor(skip / take) + 1, limit: take };
  }

  async getById(user: AuthUser, id: string) {
    const report = await this.prisma.activityReport.findFirst({
      where: { id, deletedAt: null },
      include: reportInclude,
    });
    if (!report || !assertOrgAccess(user, report.organizationId)) {
      throw new NotFoundException('Report not found');
    }
    if (!assertCampusAccess(user, report.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    if (
      user.roles.includes('Mentor') &&
      !hasPermission(user, 'Activity.Approve') &&
      report.submittedById !== user.id
    ) {
      throw new ForbiddenException('You can only view your own reports');
    }
    return report;
  }

  async create(
    user: AuthUser,
    dto: {
      organizationId: string;
      title: string;
      categoryId: string;
      campusId: string;
      programId?: string;
      academicYearId: string;
      reportDate: string;
      startTime?: string;
      endTime?: string;
      location?: string;
      objectives?: string;
      description: string;
      activitiesPerformed?: string;
      outcomes?: string;
      challenges?: string;
      recommendations?: string;
      participantCount?: number;
      studentIds?: string[];
    },
  ) {
    if (!assertOrgAccess(user, dto.organizationId)) {
      throw new ForbiddenException('Organization not in your scope');
    }
    if (!assertCampusAccess(user, dto.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }

    await this.assertBindings(dto);

    const reportNumber = await this.nextReportNumber(dto.organizationId);
    const report = await this.prisma.activityReport.create({
      data: {
        organizationId: dto.organizationId,
        reportNumber,
        title: dto.title.trim(),
        categoryId: dto.categoryId,
        campusId: dto.campusId,
        programId: dto.programId || null,
        academicYearId: dto.academicYearId,
        reportDate: new Date(dto.reportDate),
        startTime: dto.startTime?.trim() || null,
        endTime: dto.endTime?.trim() || null,
        location: dto.location?.trim() || null,
        objectives: dto.objectives?.trim() || null,
        description: dto.description.trim(),
        activitiesPerformed: dto.activitiesPerformed?.trim() || null,
        outcomes: dto.outcomes?.trim() || null,
        challenges: dto.challenges?.trim() || null,
        recommendations: dto.recommendations?.trim() || null,
        participantCount: dto.participantCount ?? dto.studentIds?.length ?? 0,
        status: ActivityReportStatus.DRAFT,
        submittedById: user.id,
        ...(dto.studentIds?.length
          ? {
              participants: {
                create: dto.studentIds.map((studentId) => ({ studentId })),
              },
            }
          : {}),
      },
      include: reportInclude,
    });

    await this.audit.log({
      userId: user.id,
      action: 'Activity.ReportCreated',
      resource: 'ActivityReport',
      resourceId: report.id,
      organizationId: dto.organizationId,
      campusId: dto.campusId,
      newValue: { reportNumber, title: report.title, status: report.status },
    });
    return report;
  }

  async update(
    user: AuthUser,
    id: string,
    dto: Partial<{
      title: string;
      categoryId: string;
      campusId: string;
      programId: string | null;
      academicYearId: string;
      reportDate: string;
      startTime: string;
      endTime: string;
      location: string;
      objectives: string;
      description: string;
      activitiesPerformed: string;
      outcomes: string;
      challenges: string;
      recommendations: string;
      participantCount: number;
      studentIds: string[];
    }>,
  ) {
    const existing = await this.requireReport(user, id);
    this.assertEditable(user, existing);

    if (dto.campusId && !assertCampusAccess(user, dto.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }

    const report = await this.prisma.$transaction(async (tx) => {
      if (dto.studentIds) {
        await tx.activityParticipant.deleteMany({ where: { reportId: id } });
        if (dto.studentIds.length) {
          await tx.activityParticipant.createMany({
            data: dto.studentIds.map((studentId) => ({ reportId: id, studentId })),
          });
        }
      }
      return tx.activityReport.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.campusId !== undefined ? { campusId: dto.campusId } : {}),
          ...(dto.programId !== undefined ? { programId: dto.programId || null } : {}),
          ...(dto.academicYearId !== undefined
            ? { academicYearId: dto.academicYearId }
            : {}),
          ...(dto.reportDate !== undefined ? { reportDate: new Date(dto.reportDate) } : {}),
          ...(dto.startTime !== undefined
            ? { startTime: dto.startTime?.trim() || null }
            : {}),
          ...(dto.endTime !== undefined ? { endTime: dto.endTime?.trim() || null } : {}),
          ...(dto.location !== undefined
            ? { location: dto.location?.trim() || null }
            : {}),
          ...(dto.objectives !== undefined
            ? { objectives: dto.objectives?.trim() || null }
            : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
          ...(dto.activitiesPerformed !== undefined
            ? { activitiesPerformed: dto.activitiesPerformed?.trim() || null }
            : {}),
          ...(dto.outcomes !== undefined
            ? { outcomes: dto.outcomes?.trim() || null }
            : {}),
          ...(dto.challenges !== undefined
            ? { challenges: dto.challenges?.trim() || null }
            : {}),
          ...(dto.recommendations !== undefined
            ? { recommendations: dto.recommendations?.trim() || null }
            : {}),
          ...(dto.participantCount !== undefined
            ? { participantCount: dto.participantCount }
            : dto.studentIds
              ? { participantCount: dto.studentIds.length }
              : {}),
          ...(existing.status === ActivityReportStatus.REJECTED
            ? { status: ActivityReportStatus.DRAFT, reviewNotes: null }
            : {}),
        },
        include: reportInclude,
      });
    });

    await this.audit.log({
      userId: user.id,
      action: 'Activity.ReportUpdated',
      resource: 'ActivityReport',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
    });
    return report;
  }

  async submit(user: AuthUser, id: string) {
    const existing = await this.requireReport(user, id);
    if (
      existing.status !== ActivityReportStatus.DRAFT &&
      existing.status !== ActivityReportStatus.REJECTED
    ) {
      throw new BadRequestException('Only draft or rejected reports can be submitted');
    }
    if (existing.submittedById !== user.id && !hasPermission(user, 'Activity.Approve')) {
      throw new ForbiddenException('Only the author can submit this report');
    }
    const report = await this.prisma.activityReport.update({
      where: { id },
      data: {
        status: ActivityReportStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: reportInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Activity.ReportSubmitted',
      resource: 'ActivityReport',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
    });
    return report;
  }

  async startReview(user: AuthUser, id: string) {
    const existing = await this.requireReport(user, id);
    if (existing.status !== ActivityReportStatus.SUBMITTED) {
      throw new BadRequestException('Report must be submitted');
    }
    return this.prisma.activityReport.update({
      where: { id },
      data: {
        status: ActivityReportStatus.UNDER_REVIEW,
        reviewedById: user.id,
      },
      include: reportInclude,
    });
  }

  async approve(user: AuthUser, id: string, notes?: string) {
    const existing = await this.requireReport(user, id);
    if (
      !statusIn(existing.status, [
        ActivityReportStatus.SUBMITTED,
        ActivityReportStatus.UNDER_REVIEW,
      ])
    ) {
      throw new BadRequestException('Report is not awaiting approval');
    }
    const report = await this.prisma.activityReport.update({
      where: { id },
      data: {
        status: ActivityReportStatus.APPROVED,
        reviewedById: user.id,
        approvedAt: new Date(),
        reviewNotes: notes?.trim() || null,
      },
      include: reportInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Activity.ReportApproved',
      resource: 'ActivityReport',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
    });
    return report;
  }

  async reject(user: AuthUser, id: string, notes: string) {
    const existing = await this.requireReport(user, id);
    if (
      !statusIn(existing.status, [
        ActivityReportStatus.SUBMITTED,
        ActivityReportStatus.UNDER_REVIEW,
      ])
    ) {
      throw new BadRequestException('Report is not awaiting review');
    }
    if (!notes?.trim()) throw new BadRequestException('Review notes are required');
    const report = await this.prisma.activityReport.update({
      where: { id },
      data: {
        status: ActivityReportStatus.REJECTED,
        reviewedById: user.id,
        reviewNotes: notes.trim(),
      },
      include: reportInclude,
    });
    await this.audit.log({
      userId: user.id,
      action: 'Activity.ReportRejected',
      resource: 'ActivityReport',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
    });
    return report;
  }

  async publish(user: AuthUser, id: string) {
    const existing = await this.requireReport(user, id);
    if (existing.status !== ActivityReportStatus.APPROVED) {
      throw new BadRequestException('Only approved reports can be published');
    }
    return this.prisma.activityReport.update({
      where: { id },
      data: {
        status: ActivityReportStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: reportInclude,
    });
  }

  async archive(user: AuthUser, id: string) {
    const existing = await this.requireReport(user, id);
    if (
      !statusIn(existing.status, [
        ActivityReportStatus.APPROVED,
        ActivityReportStatus.PUBLISHED,
      ])
    ) {
      throw new BadRequestException('Only approved/published reports can be archived');
    }
    return this.prisma.activityReport.update({
      where: { id },
      data: { status: ActivityReportStatus.ARCHIVED },
      include: reportInclude,
    });
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.requireReport(user, id);
    if (
      existing.status !== ActivityReportStatus.DRAFT &&
      !hasPermission(user, 'Activity.Delete')
    ) {
      throw new ForbiddenException('Only drafts can be deleted without Delete permission');
    }
    await this.prisma.activityReport.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      userId: user.id,
      action: 'Activity.ReportDeleted',
      resource: 'ActivityReport',
      resourceId: id,
      organizationId: existing.organizationId,
      campusId: existing.campusId,
    });
    return { success: true };
  }

  // Media ---------------------------------------------------------------------

  async uploadMedia(
    user: AuthUser,
    reportId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    const report = await this.requireReport(user, reportId);
    if (
      !statusIn(report.status, [
        ActivityReportStatus.DRAFT,
        ActivityReportStatus.REJECTED,
      ]) &&
      !hasPermission(user, 'Activity.Approve')
    ) {
      throw new BadRequestException('Media can only be added to draft/rejected reports');
    }
    if (!file?.buffer?.length) throw new BadRequestException('File is required');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds maximum size of ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`,
      );
    }
    const mimeBase = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mimeBase)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const ext = extname(file.originalname || '').toLowerCase() || this.extFromMime(mimeBase);
    const hash = createHash('sha1').update(randomBytes(8)).digest('hex').slice(0, 12);
    const fileName = `${reportId.slice(0, 8)}-${Date.now()}-${hash}${ext}`;
    const dir = join(this.uploadRoot, report.organizationId, reportId);
    mkdirSync(dir, { recursive: true });
    const storagePath = join(dir, fileName);
    writeFileSync(storagePath, file.buffer);

    const fileType = mimeBase.startsWith('image/')
      ? 'image'
      : mimeBase.startsWith('video/')
        ? 'video'
        : mimeBase.startsWith('audio/')
          ? 'audio'
          : 'document';

    const media = await this.prisma.activityMedia.create({
      data: {
        reportId,
        fileName,
        originalName: file.originalname || fileName,
        fileType,
        mimeType: mimeBase,
        fileSize: file.size,
        storagePath,
        caption: caption?.trim() || null,
        uploadedById: user.id,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });

    await this.audit.log({
      userId: user.id,
      action: 'Activity.MediaUploaded',
      resource: 'ActivityMedia',
      resourceId: media.id,
      organizationId: report.organizationId,
      campusId: report.campusId,
      newValue: { fileName, fileType, fileSize: file.size },
    });
    return media;
  }

  async updateMediaCaption(user: AuthUser, mediaId: string, caption?: string) {
    const media = await this.prisma.activityMedia.findFirst({
      where: { id: mediaId },
      include: { report: true },
    });
    if (!media || media.report.deletedAt) throw new NotFoundException('Media not found');
    if (!assertOrgAccess(user, media.report.organizationId)) {
      throw new NotFoundException('Media not found');
    }
    if (!assertCampusAccess(user, media.report.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    return this.prisma.activityMedia.update({
      where: { id: mediaId },
      data: { caption: caption?.trim() || null },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  async deleteMedia(user: AuthUser, mediaId: string) {
    const media = await this.prisma.activityMedia.findFirst({
      where: { id: mediaId },
      include: { report: true },
    });
    if (!media || media.report.deletedAt) throw new NotFoundException('Media not found');
    if (!assertCampusAccess(user, media.report.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    this.assertEditable(user, media.report);
    if (existsSync(media.storagePath)) {
      try {
        unlinkSync(media.storagePath);
      } catch {
        /* ignore */
      }
    }
    await this.prisma.activityMedia.delete({ where: { id: mediaId } });
    return { success: true };
  }

  async openMediaStream(user: AuthUser, mediaId: string) {
    const media = await this.prisma.activityMedia.findFirst({
      where: { id: mediaId },
      include: { report: true },
    });
    if (!media || media.report.deletedAt) throw new NotFoundException('Media not found');
    if (!assertOrgAccess(user, media.report.organizationId)) {
      throw new NotFoundException('Media not found');
    }
    if (!assertCampusAccess(user, media.report.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    if (!existsSync(media.storagePath)) {
      throw new NotFoundException('File missing on disk');
    }
    return {
      stream: createReadStream(media.storagePath),
      mimeType: media.mimeType,
      fileName: media.originalName,
      fileSize: media.fileSize,
    };
  }

  async gallery(
    user: AuthUser,
    query: {
      organizationId?: string;
      campusId?: string;
      categoryId?: string;
      from?: string;
      to?: string;
      take?: number;
    },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    const campusFilter = resolveCampusId(user, query.campusId);
    const whereReport: Prisma.ActivityReportWhereInput = {
      deletedAt: null,
      status: {
        in: [
          ActivityReportStatus.APPROVED,
          ActivityReportStatus.PUBLISHED,
          ActivityReportStatus.SUBMITTED,
          ActivityReportStatus.UNDER_REVIEW,
        ],
      },
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...(campusFilter !== undefined
        ? { campusId: campusFilter }
        : scopeCampusFilter(user)),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.from || query.to
        ? {
            reportDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.activityMedia.findMany({
      where: {
        fileType: 'image',
        report: whereReport,
      },
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
        report: {
          select: {
            id: true,
            reportNumber: true,
            title: true,
            reportDate: true,
            campus: { select: { id: true, shortName: true, name: true } },
            category: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { uploadedAt: 'desc' },
      take: Math.min(query.take ?? 100, 300),
    });
  }

  async timeline(
    user: AuthUser,
    query: { organizationId?: string; campusId?: string; days?: number },
  ) {
    const orgId = resolveActiveOrganizationId(user, query.organizationId);
    const campusFilter = resolveCampusId(user, query.campusId);
    const days = Math.min(Math.max(query.days ?? 30, 1), 120);
    const from = new Date();
    from.setDate(from.getDate() - days);

    const items = await this.prisma.activityReport.findMany({
      where: {
        deletedAt: null,
        reportDate: { gte: from },
        status: {
          notIn: [ActivityReportStatus.DRAFT, ActivityReportStatus.REJECTED],
        },
        ...(orgId ? { organizationId: orgId } : {}),
        ...scopeOrganizationFilter(user),
        ...(campusFilter !== undefined
          ? { campusId: campusFilter }
          : scopeCampusFilter(user)),
      },
      include: {
        category: { select: { id: true, name: true } },
        campus: { select: { id: true, shortName: true, name: true } },
        _count: { select: { media: true } },
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const byDate = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.reportDate.toISOString().slice(0, 10);
      const list = byDate.get(key) ?? [];
      list.push(item);
      byDate.set(key, list);
    }
    return Array.from(byDate.entries()).map(([date, reports]) => ({
      date,
      reports,
      photoCount: reports.reduce((n, r) => n + r._count.media, 0),
    }));
  }

  async summary(user: AuthUser, organizationId?: string) {
    const orgId = resolveActiveOrganizationId(user, organizationId);
    const base: Prisma.ActivityReportWhereInput = {
      deletedAt: null,
      ...(orgId ? { organizationId: orgId } : {}),
      ...scopeOrganizationFilter(user),
      ...scopeCampusFilter(user),
    };
    const dayStart = ethiopiaDayStartUtc(new Date());
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 6);

    const [
      activitiesToday,
      submittedToday,
      pendingApprovals,
      approved,
      photosToday,
      weekly,
      campusesWithReports,
    ] = await Promise.all([
      this.prisma.activityReport.count({
        where: { ...base, reportDate: { gte: dayStart } },
      }),
      this.prisma.activityReport.count({
        where: {
          ...base,
          submittedAt: { gte: dayStart },
          status: { not: ActivityReportStatus.DRAFT },
        },
      }),
      this.prisma.activityReport.count({
        where: {
          ...base,
          status: {
            in: [ActivityReportStatus.SUBMITTED, ActivityReportStatus.UNDER_REVIEW],
          },
        },
      }),
      this.prisma.activityReport.count({
        where: {
          ...base,
          status: {
            in: [ActivityReportStatus.APPROVED, ActivityReportStatus.PUBLISHED],
          },
        },
      }),
      this.prisma.activityMedia.count({
        where: {
          uploadedAt: { gte: dayStart },
          fileType: 'image',
          report: base,
        },
      }),
      this.prisma.activityReport.count({
        where: { ...base, reportDate: { gte: weekStart } },
      }),
      this.prisma.activityReport.findMany({
        where: { ...base, reportDate: { gte: dayStart } },
        select: { campusId: true },
        distinct: ['campusId'],
      }),
    ]);

    return {
      activitiesToday,
      submittedToday,
      pendingApprovals,
      approvedReports: approved,
      photosToday,
      weeklyActivityCount: weekly,
      activeCampusesToday: campusesWithReports.length,
    };
  }

  async exportRows(
    user: AuthUser,
    query: {
      organizationId?: string;
      campusId?: string;
      from?: string;
      to?: string;
      status?: ActivityReportStatus;
    },
  ) {
    const result = await this.list(user, {
      ...query,
      take: 500,
      skip: 0,
    });
    return {
      count: result.total,
      items: result.items,
    };
  }

  // Helpers -------------------------------------------------------------------

  private async requireReport(user: AuthUser, id: string) {
    const report = await this.prisma.activityReport.findFirst({
      where: { id, deletedAt: null },
    });
    if (!report || !assertOrgAccess(user, report.organizationId)) {
      throw new NotFoundException('Report not found');
    }
    if (!assertCampusAccess(user, report.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }
    return report;
  }

  private assertEditable(
    user: AuthUser,
    report: { status: ActivityReportStatus; submittedById: string },
  ) {
    const editable = statusIn(report.status, [
      ActivityReportStatus.DRAFT,
      ActivityReportStatus.REJECTED,
    ]);
    if (!editable && !hasPermission(user, 'Activity.Approve')) {
      throw new BadRequestException('Report is locked after submission');
    }
    if (
      report.submittedById !== user.id &&
      !hasPermission(user, 'Activity.Approve') &&
      !hasPermission(user, 'Activity.Update')
    ) {
      throw new ForbiddenException('You cannot edit this report');
    }
  }

  private async assertBindings(dto: {
    organizationId: string;
    categoryId: string;
    campusId: string;
    programId?: string;
    academicYearId: string;
  }) {
    const [category, campus, year] = await Promise.all([
      this.prisma.activityCategory.findFirst({
        where: {
          id: dto.categoryId,
          organizationId: dto.organizationId,
          deletedAt: null,
          active: true,
        },
      }),
      this.prisma.campus.findFirst({
        where: {
          id: dto.campusId,
          organizationId: dto.organizationId,
          deletedAt: null,
        },
      }),
      this.prisma.academicYear.findFirst({
        where: {
          id: dto.academicYearId,
          organizationId: dto.organizationId,
          deletedAt: null,
        },
      }),
    ]);
    if (!category) throw new BadRequestException('Invalid category');
    if (!campus) throw new BadRequestException('Invalid campus');
    if (!year) throw new BadRequestException('Invalid academic year');
    if (dto.programId) {
      const program = await this.prisma.program.findFirst({
        where: {
          id: dto.programId,
          campusId: dto.campusId,
          deletedAt: null,
        },
      });
      if (!program) throw new BadRequestException('Program must belong to the selected campus');
    }
  }

  private async nextReportNumber(organizationId: string) {
    const year = new Date().getFullYear();
    const prefix = `AR-${year}-`;
    const latest = await this.prisma.activityReport.findFirst({
      where: { organizationId, reportNumber: { startsWith: prefix } },
      orderBy: { reportNumber: 'desc' },
      select: { reportNumber: true },
    });
    let seq = 1;
    if (latest?.reportNumber) {
      const n = Number.parseInt(latest.reportNumber.slice(prefix.length), 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private extFromMime(mime: string) {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/mp4': '.m4a',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
    };
    return map[mime] ?? '.bin';
  }
}
