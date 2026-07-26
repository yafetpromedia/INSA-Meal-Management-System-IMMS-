import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
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
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.students.list(user, {
      search,
      organizationId,
      campusId,
      programId,
      department,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
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
}
