'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/organizations', label: 'Organizations' },
  { href: '/campuses', label: 'Campuses' },
  { href: '/programs', label: 'Programs' },
  { href: '/students', label: 'Students' },
  { href: '/import', label: 'Excel Import' },
  { href: '/meals', label: 'Meal Distribution' },
  { href: '/meal-history', label: 'Meal History' },
  { href: '/users', label: 'Mentors & Food Staff' },
  { href: '/reports', label: 'Reports' },
  { href: '/audit-logs', label: 'Audit Logs' },
  { href: '/settings', label: 'Settings' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    clearTokens();
    router.push('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          IMMS
          <span>Meal Management System</span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname.startsWith(item.href) ? 'active' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button className="btn" type="button" onClick={logout} style={{ marginTop: 'auto' }}>
          Log out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
