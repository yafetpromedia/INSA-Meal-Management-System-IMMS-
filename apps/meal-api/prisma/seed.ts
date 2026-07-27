import { AccountStatus, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const PLATFORM = '__platform__';
const ORG_SCOPE = '__org__';

const PERMISSIONS: Array<{ key: string; module: string; action: string }> = [
  { key: 'Dashboard.View', module: 'Dashboard', action: 'View' },
  { key: 'Organization.View', module: 'Organization', action: 'View' },
  { key: 'Organization.Create', module: 'Organization', action: 'Create' },
  { key: 'Organization.Update', module: 'Organization', action: 'Update' },
  { key: 'Organization.Manage', module: 'Organization', action: 'Manage' },
  { key: 'Campus.View', module: 'Campus', action: 'View' },
  { key: 'Campus.Create', module: 'Campus', action: 'Create' },
  { key: 'Campus.Update', module: 'Campus', action: 'Update' },
  { key: 'Campus.Delete', module: 'Campus', action: 'Delete' },
  { key: 'Program.View', module: 'Program', action: 'View' },
  { key: 'Program.Create', module: 'Program', action: 'Create' },
  { key: 'Program.Update', module: 'Program', action: 'Update' },
  { key: 'Program.Delete', module: 'Program', action: 'Delete' },
  { key: 'AcademicYear.View', module: 'AcademicYear', action: 'View' },
  { key: 'AcademicYear.Create', module: 'AcademicYear', action: 'Create' },
  { key: 'AcademicYear.Manage', module: 'AcademicYear', action: 'Manage' },
  { key: 'Student.View', module: 'Student', action: 'View' },
  { key: 'Student.Search', module: 'Student', action: 'Search' },
  { key: 'Student.Create', module: 'Student', action: 'Create' },
  { key: 'Student.Update', module: 'Student', action: 'Update' },
  { key: 'Student.Delete', module: 'Student', action: 'Delete' },
  { key: 'Student.Import', module: 'Student', action: 'Import' },
  { key: 'Student.Export', module: 'Student', action: 'Export' },
  { key: 'Meal.View', module: 'Meal', action: 'View' },
  { key: 'Meal.Create', module: 'Meal', action: 'Create' },
  { key: 'Meal.Update', module: 'Meal', action: 'Update' },
  { key: 'Meal.Override', module: 'Meal', action: 'Override' },
  { key: 'Report.View', module: 'Report', action: 'View' },
  { key: 'Report.Export', module: 'Report', action: 'Export' },
  { key: 'User.View', module: 'User', action: 'View' },
  { key: 'User.Create', module: 'User', action: 'Create' },
  { key: 'User.Update', module: 'User', action: 'Update' },
  { key: 'User.Assign', module: 'User', action: 'Assign' },
  { key: 'Role.View', module: 'Role', action: 'View' },
  { key: 'Role.Manage', module: 'Role', action: 'Manage' },
  { key: 'AuditLog.View', module: 'AuditLog', action: 'View' },
  { key: 'AuditLog.Delete', module: 'AuditLog', action: 'Delete' },
  { key: 'Settings.View', module: 'Settings', action: 'View' },
  { key: 'Settings.Manage', module: 'Settings', action: 'Manage' },
];

const ROLE_PERMISSIONS: Record<string, string[] | '*'> = {
  SuperAdmin: '*',
  Admin: [
    'Dashboard.View',
    'Organization.View',
    'Campus.View',
    'Program.View',
    'Program.Create',
    'Program.Update',
    'AcademicYear.View',
    'Student.View',
    'Student.Search',
    'Student.Create',
    'Student.Update',
    'Student.Import',
    'Student.Export',
    'Meal.View',
    'Meal.Create',
    'Meal.Update',
    'Meal.Override',
    'Report.View',
    'Report.Export',
    'User.View',
    'User.Create',
    'User.Update',
    'User.Assign',
    'AuditLog.View',
    'Settings.View',
  ],
  CampusCoordinator: [
    'Dashboard.View',
    'Organization.View',
    'Campus.View',
    'Program.View',
    'Program.Create',
    'Program.Update',
    'AcademicYear.View',
    'Student.View',
    'Student.Search',
    'Student.Create',
    'Student.Update',
    'Student.Import',
    'Meal.View',
    'Meal.Create',
    'Meal.Update',
    'Report.View',
    'Report.Export',
    'User.View',
    'User.Assign',
    'AuditLog.View',
  ],
  ProgramCoordinator: [
    'Dashboard.View',
    'Organization.View',
    'Program.View',
    'AcademicYear.View',
    'Student.View',
    'Student.Search',
    'Student.Update',
    'Meal.View',
    'Report.View',
  ],
  Mentor: [
    'Dashboard.View',
    'Student.View',
    'Student.Search',
    'Meal.View',
    'Meal.Create',
    'Report.View',
  ],
  FoodStaff: ['Dashboard.View', 'Student.Search', 'Meal.View', 'Meal.Create'],
  Viewer: [
    'Dashboard.View',
    'Organization.View',
    'Campus.View',
    'Program.View',
    'Student.View',
    'Meal.View',
    'Report.View',
  ],
};

const PLATFORM_MODULES = [
  { key: 'dashboard', name: 'Dashboard', isCore: true, sortOrder: 1 },
  { key: 'campuses', name: 'Campus Management', isCore: true, sortOrder: 2 },
  { key: 'programs', name: 'Program Management', isCore: true, sortOrder: 3 },
  { key: 'students', name: 'Student Management', isCore: true, sortOrder: 4 },
  { key: 'meals', name: 'Meal Distribution', isCore: true, sortOrder: 5 },
  { key: 'meal_history', name: 'Meal History', isCore: true, sortOrder: 6 },
  { key: 'reports', name: 'Reports', isCore: true, sortOrder: 7 },
  { key: 'audit', name: 'Audit Logs', isCore: true, sortOrder: 8 },
];

async function seedReferenceCategory(
  key: string,
  name: string,
  items: Array<{ code: string; label: string; sortOrder: number }>,
) {
  const category = await prisma.referenceDataCategory.upsert({
    where: { scopeKey_key: { scopeKey: PLATFORM, key } },
    create: { scopeKey: PLATFORM, key, name, isSystem: true },
    update: { name, isSystem: true },
  });
  for (const item of items) {
    await prisma.referenceDataItem.upsert({
      where: { categoryId_code: { categoryId: category.id, code: item.code } },
      create: { categoryId: category.id, ...item },
      update: { label: item.label, sortOrder: item.sortOrder },
    });
  }
}

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: p,
      update: { module: p.module, action: p.action },
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

  for (const [name, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { scopeKey_name: { scopeKey: PLATFORM, name } },
      create: {
        name,
        displayName: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
        isSystem: true,
        scopeKey: PLATFORM,
        description: `System role: ${name}`,
      },
      update: { isSystem: true, scopeKey: PLATFORM },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const selected =
      keys === '*' ? allPermissions : keys.map((k) => permissionByKey.get(k)!).filter(Boolean);
    await prisma.rolePermission.createMany({
      data: selected.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // Disable non-meal modules if they exist from older seeds
  await prisma.organizationModule.deleteMany({
    where: {
      moduleKey: {
        in: ['attendance', 'dormitory', 'certificates', 'events', 'incidents', 'assets', 'alumni'],
      },
    },
  });
  await prisma.platformModule.deleteMany({
    where: {
      key: {
        in: ['attendance', 'dormitory', 'certificates', 'events', 'incidents', 'assets', 'alumni'],
      },
    },
  });

  for (const mod of PLATFORM_MODULES) {
    await prisma.platformModule.upsert({
      where: { key: mod.key },
      create: { ...mod, description: `${mod.name} module` },
      update: { name: mod.name, isCore: mod.isCore, sortOrder: mod.sortOrder },
    });
  }

  await seedReferenceCategory('meal_session', 'Meal Sessions', [
    { code: 'BREAKFAST', label: 'Breakfast', sortOrder: 1 },
    { code: 'LUNCH', label: 'Lunch', sortOrder: 2 },
    { code: 'DINNER', label: 'Dinner', sortOrder: 3 },
  ]);
  await seedReferenceCategory('gender', 'Gender', [
    { code: 'MALE', label: 'Male', sortOrder: 1 },
    { code: 'FEMALE', label: 'Female', sortOrder: 2 },
    { code: 'OTHER', label: 'Other', sortOrder: 3 },
  ]);
  await seedReferenceCategory('education_level', 'Education Level', [
    { code: 'UNDERGRADUATE', label: 'Undergraduate', sortOrder: 1 },
    { code: 'GRADUATE', label: 'Graduate', sortOrder: 2 },
    { code: 'OTHER', label: 'Other', sortOrder: 3 },
  ]);

  for (const rule of [
    { key: 'auth.max_failed_logins', value: 5, description: 'Failed logins before lockout' },
    { key: 'auth.lockout_minutes', value: 30, description: 'Account lockout duration' },
    { key: 'meal.one_per_session_per_day', value: true, description: 'Prevent duplicate meals' },
    {
      key: 'meal.allow_admin_override',
      value: true,
      description: 'Allow privileged meal overrides with reason',
    },
  ]) {
    await prisma.businessRule.upsert({
      where: { scopeKey_key: { scopeKey: PLATFORM, key: rule.key } },
      create: {
        scopeKey: PLATFORM,
        key: rule.key,
        value: rule.value as object,
        description: rule.description,
      },
      update: { value: rule.value as object, description: rule.description },
    });
  }

  await prisma.systemSetting.upsert({
    where: { scopeKey_key: { scopeKey: PLATFORM, key: 'platform.name' } },
    create: { scopeKey: PLATFORM, key: 'platform.name', value: 'IMMS' },
    update: { value: 'IMMS' },
  });
  await prisma.systemSetting.upsert({
    where: { scopeKey_key: { scopeKey: PLATFORM, key: 'platform.displayName' } },
    create: {
      scopeKey: PLATFORM,
      key: 'platform.displayName',
      value: 'INSA Meal Management System',
    },
    update: { value: 'INSA Meal Management System' },
  });

  for (const setting of [
    {
      key: 'settings.meals',
      value: {
        defaultGraceMinutes: 15,
        scannerAutoResetSeconds: 3,
        soundEnabled: true,
        allowAdminOverride: true,
        requireOverrideReason: true,
        oneMealPerSessionPerDay: true,
      },
      description: 'Meal distribution behaviour',
    },
    {
      key: 'settings.security',
      value: {
        maxFailedLogins: 5,
        lockoutMinutes: 30,
        sessionTimeoutMinutes: 480,
        requireStrongPassword: true,
        allowRememberMe: true,
      },
      description: 'Authentication and session security',
    },
    {
      key: 'settings.notifications',
      value: {
        emailEnabled: false,
        mealAlerts: true,
        duplicateAlerts: true,
        dailyDigest: false,
        adminEmail: '',
      },
      description: 'Alert and email notification preferences',
    },
    {
      key: 'settings.branding',
      value: {
        accentColor: '#E85D04',
        logoUrl: '',
        faviconUrl: '',
        supportEmail: '',
      },
      description: 'Brand appearance',
    },
  ]) {
    await prisma.systemSetting.upsert({
      where: { scopeKey_key: { scopeKey: PLATFORM, key: setting.key } },
      create: {
        scopeKey: PLATFORM,
        key: setting.key,
        value: setting.value,
        description: setting.description,
      },
      update: { value: setting.value, description: setting.description },
    });
  }

  const org = await prisma.organization.upsert({
    where: { code: 'INSA' },
    create: {
      code: 'INSA',
      name: 'Information Network Security Administration',
      description: 'Sample tenant for local development',
      timezone: 'Africa/Addis_Ababa',
      locale: 'en',
    },
    update: {},
  });

  const coreModules = await prisma.platformModule.findMany({ where: { isCore: true } });
  for (const mod of coreModules) {
    await prisma.organizationModule.upsert({
      where: {
        organizationId_moduleKey: { organizationId: org.id, moduleKey: mod.key },
      },
      create: { organizationId: org.id, moduleKey: mod.key, isEnabled: true },
      update: { isEnabled: true },
    });
  }

  const year = await prisma.academicYear.upsert({
    where: { organizationId_name: { organizationId: org.id, name: '2026' } },
    create: {
      organizationId: org.id,
      name: '2026',
      isCurrent: true,
      startDate: new Date('2026-01-01'),
    },
    update: { isCurrent: true },
  });

  const campusA = await prisma.campus.upsert({
    where: { organizationId_shortName: { organizationId: org.id, shortName: 'CAMPUS-A' } },
    create: {
      organizationId: org.id,
      name: 'Sample Campus A',
      shortName: 'CAMPUS-A',
      location: 'Addis Ababa',
      description: 'Demo campus — replace via admin UI',
    },
    update: {},
  });

  await prisma.campus.upsert({
    where: { organizationId_shortName: { organizationId: org.id, shortName: 'CAMPUS-B' } },
    create: {
      organizationId: org.id,
      name: 'Sample Campus B',
      shortName: 'CAMPUS-B',
      location: 'Regional Center',
      description: 'Demo campus — replace via admin UI',
    },
    update: {},
  });

  const program = await prisma.program.upsert({
    where: {
      campusId_name_academicYearId: {
        campusId: campusA.id,
        name: 'Sample Program',
        academicYearId: year.id,
      },
    },
    create: {
      organizationId: org.id,
      name: 'Sample Program',
      campusId: campusA.id,
      academicYearId: year.id,
      capacity: 200,
      description: 'Demo program',
    },
    update: {},
  });

  for (const meal of [
    { code: 'BREAKFAST', name: 'Breakfast', startTime: '06:00', endTime: '09:00', sortOrder: 1 },
    { code: 'LUNCH', name: 'Lunch', startTime: '11:30', endTime: '14:30', sortOrder: 2 },
    { code: 'DINNER', name: 'Dinner', startTime: '18:00', endTime: '23:00', sortOrder: 3 },
  ]) {
    await prisma.mealSessionConfig.upsert({
      where: {
        organizationId_scopeKey_code: {
          organizationId: org.id,
          scopeKey: ORG_SCOPE,
          code: meal.code,
        },
      },
      create: {
        organizationId: org.id,
        scopeKey: ORG_SCOPE,
        gracePeriod: 15,
        isActive: true,
        ...meal,
      },
      update: {
        startTime: meal.startTime,
        endTime: meal.endTime,
        name: meal.name,
        isActive: true,
      },
    });
  }

  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@insa.gov.et';
  const username = (process.env.SEED_SUPERADMIN_USERNAME ?? 'superadmin').toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe!123';
  const passwordHash = await argon2.hash(password);
  const superRole = await prisma.role.findFirstOrThrow({
    where: { scopeKey: PLATFORM, name: 'SuperAdmin' },
  });

  const existingByUsername = await prisma.user.findUnique({ where: { username } });
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  const admin =
    existingByUsername ??
    existingByEmail ??
    (await prisma.user.create({
      data: {
        username,
        email,
        fullName: 'IMMS Super Admin',
        passwordHash,
        status: AccountStatus.ACTIVE,
        roles: { create: [{ roleId: superRole.id }] },
        organizationAssignments: {
          create: [{ organizationId: org.id, isDefault: true }],
        },
      },
    }));

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      username,
      email,
      passwordHash,
      status: AccountStatus.ACTIVE,
      fullName: 'IMMS Super Admin',
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
    create: { userId: admin.id, roleId: superRole.id },
    update: {},
  });
  await prisma.userOrganizationAssignment.upsert({
    where: {
      userId_organizationId: { userId: admin.id, organizationId: org.id },
    },
    create: { userId: admin.id, organizationId: org.id, isDefault: true },
    update: { isDefault: true },
  });

  await prisma.student.upsert({
    where: {
      organizationId_studentId: { organizationId: org.id, studentId: 'DEMO-1001-26' },
    },
    create: {
      organizationId: org.id,
      studentId: 'DEMO-1001-26',
      barcode: 'DEMO-1001-26',
      fullName: 'Demo Student',
      gender: 'FEMALE',
      department: 'Computer Science',
      educationLevel: 'UNDERGRADUATE',
      campusId: campusA.id,
      programId: program.id,
      academicYearId: year.id,
    },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log('IMMS seed complete');
  // eslint-disable-next-line no-console
  console.log(`Super Admin: ${username} / ${password}`);
  // eslint-disable-next-line no-console
  console.log(`Sample org: ${org.code}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
