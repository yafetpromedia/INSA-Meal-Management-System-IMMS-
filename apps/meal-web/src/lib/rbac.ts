/** Frontend RBAC helpers aligned with SRS Part 3 (meal-only). */

export type ImmsUser = {
  fullName?: string;
  username?: string;
  email?: string | null;
  roles?: string[];
  campusIds?: string[];
  programIds?: string[];
  organizationIds?: string[];
  defaultOrganizationId?: string | null;
  mentorProfile?: {
    id: string;
    campusId: string;
    programId: string | null;
    academicYearId: string;
  } | null;
};

export function readStoredUser(): ImmsUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('imms_user') || sessionStorage.getItem('imms_user');
    return JSON.parse(raw ?? 'null') as ImmsUser | null;
  } catch {
    return null;
  }
}

export function hasAnyRole(user: ImmsUser | null | undefined, roles: string[]) {
  const userRoles = user?.roles ?? [];
  if (userRoles.includes('SuperAdmin')) return true;
  return roles.some((r) => userRoles.includes(r));
}

export function isSuperAdmin(user: ImmsUser | null | undefined) {
  return (user?.roles ?? []).includes('SuperAdmin');
}

/** Mentor / Food Staff — operational meal roles, not admin. */
export function isOperationalStaff(user: ImmsUser | null | undefined) {
  const roles = user?.roles ?? [];
  return (
    roles.includes('Mentor') ||
    roles.includes('FoodStaff') ||
    roles.includes('Viewer')
  ) && !roles.includes('SuperAdmin') && !roles.includes('Admin') && !roles.includes('CampusCoordinator') && !roles.includes('ProgramCoordinator');
}

export function canManageStudents(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin', 'CampusCoordinator', 'ProgramCoordinator']);
}

export function canImportStudents(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin', 'CampusCoordinator']);
}

export function homePathForRole(user: ImmsUser | null | undefined) {
  const roles = user?.roles ?? [];
  if (roles.includes('GateOfficer')) return '/gate';
  if (roles.includes('FoodStaff') || roles.includes('Mentor')) return '/meals';
  return '/dashboard';
}

export function canApproveLeave(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin', 'CampusCoordinator', 'Mentor']);
}

export function canCreateLeave(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, [
    'SuperAdmin',
    'Admin',
    'CampusCoordinator',
    'ProgramCoordinator',
    'Mentor',
  ]);
}

export function canViewLeaveSummary(user: ImmsUser | null | undefined) {
  const roles = user?.roles ?? [];
  if (roles.includes('SuperAdmin')) return true;
  const mealOnly =
    roles.includes('FoodStaff') &&
    !roles.some((r) =>
      [
        'Admin',
        'CampusCoordinator',
        'ProgramCoordinator',
        'Mentor',
        'Viewer',
        'GateOfficer',
      ].includes(r),
    );
  if (mealOnly) return false;
  return hasAnyRole(user, [
    'Admin',
    'CampusCoordinator',
    'ProgramCoordinator',
    'Mentor',
    'Viewer',
    'GateOfficer',
  ]);
}

export function canViewDisciplinary(user: ImmsUser | null | undefined = readStoredUser()) {
  return hasAnyRole(user, [
    'SuperAdmin',
    'Admin',
    'CampusCoordinator',
    'ProgramCoordinator',
    'Mentor',
    'Viewer',
    'GateOfficer',
  ]);
}

export function canCreateDisciplinary(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, [
    'SuperAdmin',
    'Admin',
    'CampusCoordinator',
    'ProgramCoordinator',
    'Mentor',
  ]);
}

export function canInvestigateDisciplinary(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin', 'CampusCoordinator']);
}

export function canDecideDisciplinary(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin', 'CampusCoordinator']);
}

export function canManageDisciplinaryTypes(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin']);
}

export function canViewDisciplinarySummary(user: ImmsUser | null | undefined) {
  return canViewDisciplinary(user);
}

export function canViewActivity(user: ImmsUser | null | undefined = readStoredUser()) {
  return hasAnyRole(user, [
    'SuperAdmin',
    'Admin',
    'CampusCoordinator',
    'ProgramCoordinator',
    'Mentor',
    'Viewer',
    'FoodStaff',
  ]);
}

export function canCreateActivity(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, [
    'SuperAdmin',
    'Admin',
    'CampusCoordinator',
    'ProgramCoordinator',
    'Mentor',
  ]);
}

export function canApproveActivity(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin', 'CampusCoordinator']);
}

export function canManageActivityCategories(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin']);
}

export function canExportActivity(user: ImmsUser | null | undefined) {
  return hasAnyRole(user, ['SuperAdmin', 'Admin', 'CampusCoordinator', 'Viewer']);
}

export function canViewActivitySummary(user: ImmsUser | null | undefined) {
  return canViewActivity(user);
}
