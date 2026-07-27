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
};

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

export function scopeCampusFilter(user: AuthUser): { campusId?: { in: string[] } } | object {
  if (user.isSuperAdmin) {
    return {};
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
