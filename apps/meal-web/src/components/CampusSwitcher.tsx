'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { api, getActiveCampusId, getActiveOrganizationId, setActiveCampusId } from '@/lib/api';
import { isSuperAdmin, readStoredUser, type ImmsUser } from '@/lib/rbac';

type Campus = { id: string; name: string; shortName: string };

function canSwitchCampus(user: ImmsUser | null) {
  const roles = user?.roles ?? [];
  return (
    isSuperAdmin(user) ||
    (roles.includes('Admin') && (user?.campusIds?.length ?? 0) === 0)
  );
}

/**
 * Super Admin (and multi-campus Admin) campus filter.
 * Mentors / Campus Coordinators are bound by assignment — no switcher.
 * Renders nothing until mounted so SSR/client HTML stays aligned.
 */
export function CampusSwitcher() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<ImmsUser | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [value, setValue] = useState<string>('all');

  useEffect(() => {
    setMounted(true);
    setUser(readStoredUser());
  }, []);

  useEffect(() => {
    if (!mounted || !canSwitchCampus(user)) return;
    setValue(getActiveCampusId() ?? 'all');
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    api<Campus[]>(`/campuses${q}`)
      .then((rows) => setCampuses(Array.isArray(rows) ? rows : []))
      .catch(() => setCampuses([]));
  }, [mounted, user]);

  useEffect(() => {
    if (!mounted) return;
    function sync() {
      setValue(getActiveCampusId() ?? 'all');
    }
    window.addEventListener('imms-campus', sync);
    return () => window.removeEventListener('imms-campus', sync);
  }, [mounted]);

  // Keep SSR and first client paint identical (empty).
  if (!mounted) return null;

  if (!canSwitchCampus(user)) {
    const bound =
      user?.mentorProfile?.campusId ??
      (user?.campusIds?.length === 1 ? user.campusIds[0] : null);
    if (!bound) return null;
    return (
      <div className="campus-switcher is-locked" title="Your assigned campus">
        <Building2 size={14} strokeWidth={1.75} aria-hidden />
        <span>Campus scoped</span>
      </div>
    );
  }

  return (
    <label className="campus-switcher">
      <Building2 size={14} strokeWidth={1.75} aria-hidden />
      <select
        className="select"
        value={value}
        aria-label="Filter by campus"
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          setActiveCampusId(next === 'all' ? null : next);
          window.location.reload();
        }}
      >
        <option value="all">All campuses</option>
        {campuses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.shortName || c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
