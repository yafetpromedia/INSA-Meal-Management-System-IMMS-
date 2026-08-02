import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportJobStatus, ImportMode, StudentStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthUser,
  assertCampusAccess,
  assertOrgAccess,
  resolveActiveOrganizationId,
  scopeOrganizationFilter,
} from '../auth/auth.types';

type RowError = { row: number; studentId?: string; message: string };

type ParsedRow = {
  row: number;
  studentId: string;
  barcode: string;
  fullName: string;
  gender?: string;
  department?: string;
  educationLevel?: string;
  email?: string;
  phone?: string;
};

function normKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function cell(row: Record<string, unknown>, aliases: string[]) {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normKey(k), v);
  }
  for (const alias of aliases) {
    const v = map.get(normKey(alias));
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

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

  async importStudentsExcel(
    user: AuthUser,
    file: Express.Multer.File | undefined,
    data: {
      organizationId: string;
      campusId: string;
      programId: string;
      academicYearId: string;
      mode?: ImportMode;
    },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Excel file is required (.xlsx or .xls)');
    }
    if (!assertOrgAccess(user, data.organizationId)) {
      throw new NotFoundException('Organization not found');
    }
    if (!assertCampusAccess(user, data.campusId)) {
      throw new ForbiddenException('Campus not in your scope');
    }

    const [campus, program, year] = await Promise.all([
      this.prisma.campus.findFirst({
        where: { id: data.campusId, organizationId: data.organizationId, deletedAt: null },
      }),
      this.prisma.program.findFirst({
        where: { id: data.programId, organizationId: data.organizationId, deletedAt: null },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: data.academicYearId, organizationId: data.organizationId, deletedAt: null },
      }),
    ]);
    if (!campus) throw new BadRequestException('Campus not found for this organization');
    if (!program) throw new BadRequestException('Program not found for this organization');
    if (!year) throw new BadRequestException('Academic year not found for this organization');
    if (program.campusId !== campus.id) {
      throw new BadRequestException('Program does not belong to the selected campus');
    }

    const mode = data.mode ?? ImportMode.ADD_ONLY;
    const started = Date.now();
    const parsed = this.parseWorkbook(file.buffer);
    const errors: RowError[] = [...parsed.errors];
    const rows = parsed.rows;
    let imported = 0;

    const job = await this.prisma.importJob.create({
      data: {
        organizationId: data.organizationId,
        uploadedById: user.id,
        originalFile: file.originalname || 'students.xlsx',
        campusId: data.campusId,
        mode,
        status: ImportJobStatus.VALIDATING,
        totalRows: rows.length + parsed.errors.length,
      },
    });

    for (const row of rows) {
      try {
        const existing = await this.prisma.student.findFirst({
          where: {
            organizationId: data.organizationId,
            studentId: row.studentId,
            deletedAt: null,
          },
        });

        if (mode === ImportMode.ADD_ONLY) {
          if (existing) {
            errors.push({
              row: row.row,
              studentId: row.studentId,
              message: 'Student ID already exists',
            });
            continue;
          }
          await this.prisma.student.create({
            data: this.toCreateData(user, data, row),
          });
          imported += 1;
          continue;
        }

        if (mode === ImportMode.UPDATE_EXISTING) {
          if (!existing) {
            errors.push({
              row: row.row,
              studentId: row.studentId,
              message: 'Student ID not found for update',
            });
            continue;
          }
          await this.prisma.student.update({
            where: { id: existing.id },
            data: this.toUpdateData(user, data, row),
          });
          imported += 1;
          continue;
        }

        // REPLACE_EXISTING = upsert
        if (existing) {
          await this.prisma.student.update({
            where: { id: existing.id },
            data: this.toUpdateData(user, data, row),
          });
        } else {
          await this.prisma.student.create({
            data: this.toCreateData(user, data, row),
          });
        }
        imported += 1;
      } catch (err) {
        errors.push({
          row: row.row,
          studentId: row.studentId,
          message: err instanceof Error ? err.message : 'Row failed',
        });
      }
    }

    const failed = errors.length;
    const status =
      imported === 0 && failed > 0 ? ImportJobStatus.FAILED : ImportJobStatus.COMPLETED;

    const updated = await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        rowsImported: imported,
        rowsFailed: failed,
        durationMs: Date.now() - started,
        completedAt: new Date(),
        errorReportUrl:
          errors.length > 0
            ? JSON.stringify({ sampleErrors: errors.slice(0, 25), totalErrors: errors.length })
            : null,
      },
    });

    return {
      job: updated,
      imported,
      failed,
      totalRows: rows.length,
      errors: errors.slice(0, 25),
    };
  }

  private toCreateData(
    user: AuthUser,
    data: {
      organizationId: string;
      campusId: string;
      programId: string;
      academicYearId: string;
    },
    row: ParsedRow,
  ) {
    return {
      organizationId: data.organizationId,
      campusId: data.campusId,
      programId: data.programId,
      academicYearId: data.academicYearId,
      studentId: row.studentId,
      barcode: row.barcode,
      fullName: row.fullName,
      gender: row.gender,
      department: row.department,
      educationLevel: row.educationLevel,
      email: row.email,
      phone: row.phone,
      status: StudentStatus.ACTIVE,
      createdById: user.id,
    };
  }

  private toUpdateData(
    user: AuthUser,
    data: {
      campusId: string;
      programId: string;
      academicYearId: string;
    },
    row: ParsedRow,
  ) {
    return {
      campusId: data.campusId,
      programId: data.programId,
      academicYearId: data.academicYearId,
      barcode: row.barcode,
      fullName: row.fullName,
      gender: row.gender || undefined,
      department: row.department || undefined,
      educationLevel: row.educationLevel || undefined,
      email: row.email || undefined,
      phone: row.phone || undefined,
      updatedById: user.id,
      deletedAt: null,
    };
  }

  private parseWorkbook(buffer: Buffer): { rows: ParsedRow[]; errors: RowError[] } {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    } catch {
      throw new BadRequestException('Could not read Excel file. Use .xlsx or .xls');
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Excel file has no sheets');
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
      blankrows: false,
    });
    if (!json.length) throw new BadRequestException('Excel sheet is empty');

    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];
    const seen = new Set<string>();

    json.forEach((raw, index) => {
      const excelRow = index + 2; // header is row 1
      const studentId = cell(raw, [
        'studentId',
        'student id',
        'student_id',
        'StudentID',
        'id',
        'ID',
        'admission number',
        'admission no',
        'admissionNo',
        'reg no',
        'regno',
        'registration number',
        'registration no',
      ]);
      const fullName = cell(raw, [
        'fullName',
        'full name',
        'FullName',
        'name',
        'Name',
        'student name',
        'trainee name',
        'full_name',
      ]);
      const barcode = cell(raw, ['barcode', 'Barcode', 'bar code']) || studentId;

      // Skip trailing / blank Excel rows entirely
      if (!studentId && !fullName) return;

      if (!studentId || !fullName) {
        errors.push({
          row: excelRow,
          studentId: studentId || undefined,
          message: 'Skipped — studentId and fullName are both required',
        });
        return;
      }

      if (seen.has(studentId)) {
        errors.push({
          row: excelRow,
          studentId,
          message: `Skipped — duplicate studentId “${studentId}” in file`,
        });
        return;
      }

      seen.add(studentId);
      rows.push({
        row: excelRow,
        studentId,
        barcode,
        fullName,
        gender: cell(raw, ['gender', 'sex']) || undefined,
        department: cell(raw, ['department', 'dept', 'faculty', 'college']) || undefined,
        educationLevel:
          cell(raw, ['educationLevel', 'education level', 'level', 'program level']) || undefined,
        email: cell(raw, ['email', 'e-mail', 'mail']) || undefined,
        phone: cell(raw, ['phone', 'mobile', 'telephone', 'tel']) || undefined,
      });
    });

    if (!rows.length) {
      throw new BadRequestException(
        'No valid student rows found. Need columns for student ID and full name (barcode optional). Blank rows are ignored.',
      );
    }
    return { rows, errors };
  }
}
