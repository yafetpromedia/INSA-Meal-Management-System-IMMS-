'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Search,
  Settings,
  Sun,
  UserCircle,
  UtensilsCrossed,
  Users,
  History,
  Timer,
  FileSpreadsheet,
  Building,
} from 'lucide-react';
import { clearTokens } from '@/lib/api';
import { homePathForRole, readStoredUser, type ImmsUser } from '@/lib/rbac';
import { useTheme } from '@/components/providers/ThemeProvider';
import { Button } from '@/components/ui/Button';
import { NotificationBell } from '@/components/NotificationBell';
import { BrandLogo } from '@/components/BrandLogo';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Roles allowed to see this item. SuperAdmin always sees all. */
  roles: string[];
};

const NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: [
      'SuperAdmin',
      'Admin',
      'CampusCoordinator',
      'ProgramCoordinator',
      'Mentor',
      'Viewer',
    ],
  },
  {
    href: '/campuses',
    label: 'Campuses',
    icon: Building2,
    roles: ['SuperAdmin', 'Admin', 'CampusCoordinator', 'Viewer'],
  },
  {
    href: '/academic-years',
    label: 'Academic Years',
    icon: CalendarDays,
    roles: ['SuperAdmin', 'Admin', 'CampusCoordinator', 'ProgramCoordinator'],
  },
  {
    href: '/programs',
    label: 'Programs',
    icon: GraduationCap,
    roles: ['SuperAdmin', 'Admin', 'CampusCoordinator', 'ProgramCoordinator', 'Viewer'],
  },
  {
    href: '/students',
    label: 'Students',
    icon: Users,
    roles: [
      'SuperAdmin',
      'Admin',
      'CampusCoordinator',
      'ProgramCoordinator',
      'Mentor',
      'Viewer',
    ],
  },
  {
    href: '/meal-sessions',
    label: 'Meal Sessions',
    icon: Timer,
    roles: ['SuperAdmin', 'Admin', 'CampusCoordinator'],
  },
  {
    href: '/meals',
    label: 'Meal Distribution',
    icon: UtensilsCrossed,
    roles: [
      'SuperAdmin',
      'Admin',
      'CampusCoordinator',
      'ProgramCoordinator',
      'Mentor',
      'FoodStaff',
    ],
  },
  {
    href: '/meal-history',
    label: 'Meal History',
    icon: History,
    roles: [
      'SuperAdmin',
      'Admin',
      'CampusCoordinator',
      'ProgramCoordinator',
      'Mentor',
      'Viewer',
    ],
  },
  {
    href: '/mentors',
    label: 'Staff',
    icon: Users,
    roles: ['SuperAdmin', 'Admin', 'CampusCoordinator', 'ProgramCoordinator'],
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: ClipboardList,
    roles: [
      'SuperAdmin',
      'Admin',
      'CampusCoordinator',
      'ProgramCoordinator',
      'Mentor',
      'Viewer',
    ],
  },
  {
    href: '/audit-logs',
    label: 'Audit Logs',
    icon: ScrollText,
    roles: ['SuperAdmin', 'Admin', 'CampusCoordinator'],
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: UserCircle,
    roles: [
      'SuperAdmin',
      'Admin',
      'CampusCoordinator',
      'ProgramCoordinator',
      'Mentor',
      'FoodStaff',
      'Viewer',
    ],
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['SuperAdmin', 'Admin'],
  },
  {
    href: '/organizations',
    label: 'Organizations',
    icon: Building,
    roles: ['SuperAdmin'],
  },
  {
    href: '/import',
    label: 'Excel Import',
    icon: FileSpreadsheet,
    roles: ['SuperAdmin', 'Admin', 'CampusCoordinator'],
  },
];

function canAccessPath(user: ImmsUser | null, pathname: string) {
  if ((user?.roles ?? []).includes('SuperAdmin')) return true;
  // Prefer the longest matching route so /students/[id] maps to Students, not a shorter prefix.
  const matches = NAV.filter(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`),
  ).sort((a, b) => b.href.length - a.href.length);
  const item = matches[0];
  if (!item) return true;
  const roles = user?.roles ?? [];
  return item.roles.some((r) => roles.includes(r));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [user, setUser] = useState<ImmsUser | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setUser(readStoredUser());
  }, []);

  const nav = useMemo(() => {
    const roles = user?.roles ?? [];
    if (roles.includes('SuperAdmin')) return NAV;
    return NAV.filter((item) => item.roles.some((r) => roles.includes(r)));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!canAccessPath(user, pathname)) {
      router.replace(homePathForRole(user));
    }
  }, [user, pathname, router]);

  function logout() {
    clearTokens();
    router.push('/login');
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    const roles = user?.roles ?? [];
    if (roles.includes('FoodStaff')) {
      router.push('/meals');
    } else {
      router.push(`/students?q=${encodeURIComponent(q)}`);
    }
    setNavOpen(false);
  }

  return (
    <div className="app-shell">
      {navOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <BrandLogo variant="mark" size={40} alt="INSA" />
          <div>
            IMMS
            <span>Meal Management</span>
          </div>
        </div>
        <nav className="nav">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={pathname.startsWith(item.href) ? 'active' : undefined}
                onClick={() => setNavOpen(false)}
              >
                <Icon aria-hidden strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Button
          variant="secondary"
          type="button"
          onClick={logout}
          className="sidebar-logout"
          style={{ marginTop: 'auto' }}
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden />
          Log out
        </Button>
      </aside>

      <div className="shell-main-col">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn mobile-nav-toggle"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu aria-hidden />
          </button>

          <form className="topbar-search" onSubmit={onSearchSubmit} role="search">
            <Search aria-hidden />
            <input
              className="input"
              type="search"
              placeholder="Search students…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
            />
          </form>

          <div className="topbar-actions">
            <NotificationBell />
            <button
              type="button"
              className="icon-btn"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              onClick={toggle}
            >
              {theme === 'light' ? <Moon aria-hidden /> : <Sun aria-hidden />}
            </button>
            <div className="user-chip" aria-label="Current user">
              <strong>{user?.fullName ?? 'User'}</strong>
              <span className="muted">
                @{user?.username ?? 'account'} · {user?.roles?.[0] ?? 'Staff'}
              </span>
            </div>
          </div>
        </header>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
