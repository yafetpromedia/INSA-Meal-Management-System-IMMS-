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
  if (roles.includes('FoodStaff') || roles.includes('Mentor')) return '/meals';
  return '/dashboard';
}
