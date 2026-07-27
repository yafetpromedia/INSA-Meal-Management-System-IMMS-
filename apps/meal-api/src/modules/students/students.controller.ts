import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolvePagination } from '../../common/utils/pagination.util';
import { AuthUser } from '../auth/auth.types';
import { StudentsService } from './students.service';

class CreateStudentDto {
  @IsString() organizationId!: string;
  @IsString() @MinLength(2) studentId!: string;
  @IsString() @MinLength(2) fullName!: string;
  @IsString() campusId!: string;
  @IsString() programId!: string;
  @IsString() academicYearId!: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() educationLevel?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
}

class UpdateStudentDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() educationLevel?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
}

@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequirePermissions('Student.View')
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('organizationId') organizationId?: string,
    @Query('campusId') campusId?: string,
    @Query('programId') programId?: string,
    @Query('department') department?: string,
    @Query('status') status?: StudentStatus,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const p = resolvePagination({ page, limit, skip, take });
    return this.students.list(user, {
      search,
      organizationId,
      campusId,
      programId,
      department,
      status,
      sort,
      order,
      skip: p.skip,
      take: p.take,
      page: p.page,
      limit: p.limit,
    });
  }

  @Get('search')
  @RequirePermissions('Student.Search')
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q = '',
    @Query('organizationId') organizationId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = resolvePagination({ page, limit });
    return this.students.search(user, q, organizationId, p.page, p.limit);
  }

  @Get('export')
  @RequirePermissions('Student.Export')
  async export(
    @CurrentUser() user: AuthUser,
    @Query('organizationId') organizationId?: string,
  ) {
    const result = await this.students.list(user, {
      organizationId,
      skip: 0,
      take: 500,
      page: 1,
      limit: 500,
    });
    return {
      format: 'json-stub',
      message: 'CSV/Excel export will be implemented in a later phase',
      count: result.total,
      items: result.items,
    };
  }

  @Get('barcode/:barcode')
  @RequirePermissions('Student.Search')
  byBarcode(
    @CurrentUser() user: AuthUser,
    @Param('barcode') barcode: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.students.getByBarcode(user, barcode, organizationId);
  }

  @Get(':id')
  @RequirePermissions('Student.View')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.students.getById(user, id);
  }

  @Post()
  @RequirePermissions('Student.Create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.students.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('Student.Update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Student.Delete')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.students.archive(user, id);
  }
}
