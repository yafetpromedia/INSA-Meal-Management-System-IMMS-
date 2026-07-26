import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ImportMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser } from '../auth/auth.types';
import { ImportService } from './import.service';

class CreateImportDto {
  @IsString() organizationId!: string;
  @IsString() originalFile!: string;
  @IsOptional() @IsString() campusId?: string;
  @IsOptional() @IsEnum(ImportMode) mode?: ImportMode;
}

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
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateImportDto) {
    const job = await this.imports.createStubJob(user, dto);
    return {
      job,
      message:
        'Upload accepted as stub. Full validate → preview → confirm pipeline comes in a later phase.',
    };
  }
}
