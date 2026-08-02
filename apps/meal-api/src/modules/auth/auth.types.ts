export const PLATFORM_SCOPE = '__platform__';
export const ORG_SCOPE = '__org__';

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  roles: string[];
  permissions: string[];
  organizationIds: string[];
  defaultOrganizationId: string | null;
  campusIds: string[];
  programIds: string[];
  isSuperAdmin: boolean;
  /**
   * Optional Super Admin / multi-campus Admin filter from `X-Active-Campus-Id`.
   * When set, all campus-scoped queries narrow to this campus.
   */
  activeCampusId: string | null;
  /** Present when the user has a camp-bound Mentor profile. */
  mentorProfile: {
    id: string;
    campusId: string;
    programId: string | null;
    academicYearId: string;
  } | null;
};

/** Roles that must never see cross-campus data. */
export const CAMPUS_BOUND_ROLES = [
  'Mentor',
  'FoodStaff',
  'GateOfficer',
  'CampusCoordinator',
  'ProgramCoordinator',
] as const;

export function isCampusBoundRole(user: AuthUser): boolean {
  return user.roles.some((r) =>
    (CAMPUS_BOUND_ROLES as readonly string[]).includes(r),
  );
}

export function hasPermission(user: AuthUser, permission: string): boolean {
  if (user.isSuperAdmin || user.permissions.includes('*')) {
    return true;
  }
  return user.permissions.includes(permission);
}

export function scopeOrganizationFilter(
  user: AuthUser,
): { organizationId?: { in: string[] } } | object {
  if (user.isSuperAdmin) {
    return {};
  }
  return { organizationId: { in: user.organizationIds } };
}

export function scopeCampusFilter(user: AuthUser): { campusId?: string | { in: string[] } } | object {
  if (user.isSuperAdmin) {
    if (user.activeCampusId) {
      return { campusId: user.activeCampusId };
    }
    return {};
  }
  if (user.activeCampusId && user.campusIds.includes(user.activeCampusId)) {
    return { campusId: user.activeCampusId };
  }
  return { campusId: { in: user.campusIds } };
}

export function scopeProgramFilter(user: AuthUser): { programId?: { in: string[] } } | object {
  if (user.isSuperAdmin) {
    return {};
  }
  if (user.programIds.length === 0) {
    return {};
  }
  return { programId: { in: user.programIds } };
}

export function assertOrgAccess(user: AuthUser, organizationId: string): boolean {
  return user.isSuperAdmin || user.organizationIds.includes(organizationId);
}

export function assertCampusAccess(user: AuthUser, campusId: string): boolean {
  if (user.isSuperAdmin) {
    if (user.activeCampusId) return user.activeCampusId === campusId;
    return true;
  }
  return user.campusIds.includes(campusId);
}

export function assertProgramAccess(user: AuthUser, programId: string): boolean {
  if (user.isSuperAdmin) return true;
  if (user.programIds.length === 0) return true;
  return user.programIds.includes(programId);
}

/**
 * Resolve campus filter without letting a request campusId overwrite scope.
 * Unauthorized requested campus → undefined (caller should 403/404).
 */
export function resolveCampusId(
  user: AuthUser,
  requestedCampusId?: string,
): string | { in: string[] } | undefined {
  if (requestedCampusId) {
    if (!assertCampusAccess(user, requestedCampusId)) return undefined;
    return requestedCampusId;
  }
  if (user.isSuperAdmin) {
    return user.activeCampusId ?? undefined;
  }
  if (user.activeCampusId && user.campusIds.includes(user.activeCampusId)) {
    return user.activeCampusId;
  }
  return { in: user.campusIds };
}

export function resolveProgramId(
  user: AuthUser,
  requestedProgramId?: string,
): string | { in: string[] } | undefined {
  if (requestedProgramId) {
    if (!assertProgramAccess(user, requestedProgramId)) return undefined;
    return requestedProgramId;
  }
  if (user.isSuperAdmin || user.programIds.length === 0) return undefined;
  return { in: user.programIds };
}

export function resolveActiveOrganizationId(
  user: AuthUser,
  requestedOrganizationId?: string,
): string | null {
  if (requestedOrganizationId) {
    if (!assertOrgAccess(user, requestedOrganizationId)) {
      return null;
    }
    return requestedOrganizationId;
  }
  return user.defaultOrganizationId ?? user.organizationIds[0] ?? null;
}
