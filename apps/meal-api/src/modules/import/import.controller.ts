import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportMode } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get('history')
  @RequirePermissions('Student.Import')
  history(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.imports.history(user, organizationId);
  }

  @Post('students')
  @RequirePermissions('Student.Import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
          return cb(
            new BadRequestException('Only .xlsx, .xls, or .csv files are allowed') as Error,
            false,
          );
        }
        return cb(null, true);
      },
    }),
  )
  async uploadStudents(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('organizationId') organizationId: string,
    @Body('campusId') campusId: string,
    @Body('programId') programId: string,
    @Body('academicYearId') academicYearId: string,
    @Body('mode') mode?: string,
  ) {
    if (!organizationId || !campusId || !programId || !academicYearId) {
      throw new BadRequestException(
        'organizationId, campusId, programId, and academicYearId are required',
      );
    }
    const resolvedMode =
      mode === ImportMode.UPDATE_EXISTING || mode === ImportMode.REPLACE_EXISTING
        ? mode
        : ImportMode.ADD_ONLY;

    return this.imports.importStudentsExcel(user, file, {
      organizationId,
      campusId,
      programId,
      academicYearId,
      mode: resolvedMode,
    });
  }
}
