import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CampusesModule } from './modules/campuses/campuses.module';
import { PlatformConfigModule } from './modules/config/config.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DisciplinaryModule } from './modules/disciplinary/disciplinary.module';
import { ImportModule } from './modules/import/import.module';
import { LeaveModule } from './modules/leave/leave.module';
import { MealsModule } from './modules/meals/meals.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StudentsModule } from './modules/students/students.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/meal-api/.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    PlatformConfigModule,
    AuthModule,
    OrganizationsModule,
    RolesModule,
    UsersModule,
    CampusesModule,
    ProgramsModule,
    AcademicYearsModule,
    StudentsModule,
    ImportModule,
    LeaveModule,
    DisciplinaryModule,
    ActivityModule,
    MealsModule,
    DashboardModule,
    ReportsModule,
    AuditModule,
    SettingsModule,
    RealtimeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
