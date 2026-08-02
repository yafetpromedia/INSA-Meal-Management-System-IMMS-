import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ActivityReportStatus } from '@prisma/client';
import { memoryStorage } from 'multer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SkipEnvelope } from '../../common/decorators/skip-envelope.decorator';
import { resolvePagination } from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/auth.types';
import { ActivityService } from './activity.service';

class CreateReportDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(3) title!: string;
  @IsString() categoryId!: string;
  @IsString() campusId!: string;
  @IsOptional() @IsString() programId?: string;
  @IsString() academicYearId!: string;
  @IsString() reportDate!: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() objectives?: string;
  @IsString() @MinLength(5) description!: string;
  @IsOptional() @IsString() activitiesPerformed?: string;
  @IsOptional() @IsString() outcomes?: string;
  @IsOptional() @IsString() challenges?: string;
  @IsOptional() @IsString() recommendations?: string;
  @IsOptional() @IsInt() @Min(0) participantCount?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) studentIds?: string[];
}

class UpdateReportDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() campusId?: string;
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  programId?: string | null;
  @IsOptional() @IsString() academicYearId?: string;
  @IsOptional() @IsString() reportDate?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() objectives?: string;
  @IsOptional() @IsString() @MinLength(5) description?: string;
  @IsOptional() @IsString() activitiesPerformed?: string;
  @IsOptional() @IsString() outcomes?: string;
  @IsOptional() @IsString() challenges?: string;
  @IsOptional() @IsString() recommendations?: string;
  @IsOptional() @IsInt() @Min(0) participantCount?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) studentIds?: string[];
}

class NotesDto {
  @IsOptional() @IsString() notes?: string;
}

class RejectDto {
  @IsString() @MinLength(2) notes!: string;
}

class CaptionDto {
  @IsOptional() @IsString() caption?: string;
}

@Controller('activity-reports')
export class ActivityReportsController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @RequirePermissions('Activity.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('status') status?: ActivityReportStatus,
    @Query('campusId') campusId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mineOnly') mineOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const p = resolvePagination({ page, limit, skip, take });
    return this.activity.list(user, {
      organizationId,
      status,
      campusId,
      categoryId,
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
  @RequirePermissions('Activity.View')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.activity.summary(user, organizationId);
  }

  @Get('form-options')
  @RequirePermissions('Activity.Create')
  formOptions(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.activity.formOptions(user, organizationId);
  }

  @Get('gallery')
  @RequirePermissions('Activity.View')
  gallery(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
  ) {
    return this.activity.gallery(user, {
      organizationId,
      campusId,
      categoryId,
      from,
      to,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('timeline')
  @RequirePermissions('Activity.View')
  timeline(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('days') days?: string,
  ) {
    return this.activity.timeline(user, {
      organizationId,
      campusId,
      days: days ? Number(days) : undefined,
    });
  }

  @Get('export')
  @RequirePermissions('Activity.Export')
  export(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: ActivityReportStatus,
  ) {
    return this.activity.exportRows(user, {
      organizationId,
      campusId,
      from,
      to,
      status,
    });
  }

  @Get('media/:mediaId/file')
  @RequirePermissions('Activity.View')
  @SkipEnvelope()
  async mediaFile(
    @CurrentUser() user: AuthUser,
    @Param('mediaId') mediaId: string,
    @Res() res: Response,
  ) {
    const file = await this.activity.openMediaStream(user, mediaId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.fileSize));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );
    file.stream.pipe(res);
  }

  @Get(':id')
  @RequirePermissions('Activity.View')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activity.getById(user, id);
  }

  @Post()
  @RequirePermissions('Activity.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.activity.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Activity.Update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.activity.update(user, id, dto);
  }

  @Post(':id/submit')
  @RequirePermissions('Activity.Submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activity.submit(user, id);
  }

  @Post(':id/review')
  @RequirePermissions('Activity.Approve')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activity.startReview(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('Activity.Approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NotesDto,
  ) {
    return this.activity.approve(user, id, dto.notes);
  }

  @Post(':id/reject')
  @RequirePermissions('Activity.Approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectDto,
  ) {
    return this.activity.reject(user, id, dto.notes);
  }

  @Post(':id/publish')
  @RequirePermissions('Activity.Approve')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activity.publish(user, id);
  }

  @Post(':id/archive')
  @RequirePermissions('Activity.Approve')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activity.archive(user, id);
  }

  @Delete(':id')
  @RequirePermissions('Activity.Delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.activity.remove(user, id);
  }

  @Post(':id/media')
  @RequirePermissions('Activity.Update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: Number(process.env.ACTIVITY_MAX_UPLOAD_BYTES ?? 12 * 1024 * 1024) },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CaptionDto,
  ) {
    return this.activity.uploadMedia(user, id, file, body.caption);
  }

  @Patch('media/:mediaId')
  @RequirePermissions('Activity.Update')
  updateCaption(
    @CurrentUser() user: AuthUser,
    @Param('mediaId') mediaId: string,
    @Body() dto: CaptionDto,
  ) {
    return this.activity.updateMediaCaption(user, mediaId, dto.caption);
  }

  @Delete('media/:mediaId')
  @RequirePermissions('Activity.Update')
  deleteMedia(@CurrentUser() user: AuthUser, @Param('mediaId') mediaId: string) {
    return this.activity.deleteMedia(user, mediaId);
  }
}
