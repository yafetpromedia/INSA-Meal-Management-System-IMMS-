'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/providers/ToastProvider';
import { BrandLogo, cacheBrandingLogoUrl } from '@/components/BrandLogo';
import { api, getActiveOrganizationId } from '@/lib/api';
import {
  DEFAULT_GATE_PASS_SETTINGS,
  GATE_PASS_SETTINGS_KEY,
  cacheGatePassSettings,
  mergeGatePassSettings,
  type GatePassTemplateSettings,
} from '@/lib/gate-pass-print';

type Setting = {
  id?: string;
  key: string;
  value: unknown;
  description?: string | null;
};

type TabId =
  | 'General'
  | 'Meal Sessions'
  | 'Branding'
  | 'Gate Pass'
  | 'Security'
  | 'Notifications';

const TABS: TabId[] = [
  'General',
  'Meal Sessions',
  'Branding',
  'Gate Pass',
  'Security',
  'Notifications',
];

const MEALS_DEFAULT = {
  defaultGraceMinutes: 15,
  scannerAutoResetSeconds: 3,
  soundEnabled: true,
  allowAdminOverride: true,
  requireOverrideReason: true,
  oneMealPerSessionPerDay: true,
};

const SECURITY_DEFAULT = {
  maxFailedLogins: 5,
  lockoutMinutes: 30,
  sessionTimeoutMinutes: 480,
  requireStrongPassword: true,
  allowRememberMe: true,
};

const NOTIFICATIONS_DEFAULT = {
  emailEnabled: false,
  mealAlerts: true,
  duplicateAlerts: true,
  dailyDigest: false,
  adminEmail: '',
};

const BRANDING_DEFAULT = {
  accentColor: '#111111',
  logoUrl: '',
  faviconUrl: '',
  supportEmail: '',
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="field" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 4, width: 16, height: 16 }}
      />
      <span>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {hint ? (
          <span className="muted" style={{ display: 'block', fontSize: '0.8125rem', marginTop: 2 }}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState<TabId>('General');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [byKey, setByKey] = useState<Record<string, unknown>>({});

  const [general, setGeneral] = useState({ displayName: '', name: '' });
  const [meals, setMeals] = useState(MEALS_DEFAULT);
  const [security, setSecurity] = useState(SECURITY_DEFAULT);
  const [notifications, setNotifications] = useState(NOTIFICATIONS_DEFAULT);
  const [branding, setBranding] = useState(BRANDING_DEFAULT);
  const [gatePass, setGatePass] = useState<GatePassTemplateSettings>(DEFAULT_GATE_PASS_SETTINGS);

  const hydrate = useCallback((items: Setting[]) => {
    const map: Record<string, unknown> = {};
    for (const s of items) map[s.key] = s.value;
    setByKey(map);

    setGeneral({
      displayName: asString(map['platform.displayName'], 'INSA Meal Management System'),
      name: asString(map['platform.name'], 'IMMS'),
    });

    const mealsObj = asObject(map['settings.meals']);
    setMeals({
      defaultGraceMinutes: asNumber(mealsObj.defaultGraceMinutes, MEALS_DEFAULT.defaultGraceMinutes),
      scannerAutoResetSeconds: asNumber(
        mealsObj.scannerAutoResetSeconds,
        MEALS_DEFAULT.scannerAutoResetSeconds,
      ),
      soundEnabled: asBool(mealsObj.soundEnabled, MEALS_DEFAULT.soundEnabled),
      allowAdminOverride: asBool(mealsObj.allowAdminOverride, MEALS_DEFAULT.allowAdminOverride),
      requireOverrideReason: asBool(
        mealsObj.requireOverrideReason,
        MEALS_DEFAULT.requireOverrideReason,
      ),
      oneMealPerSessionPerDay: asBool(
        mealsObj.oneMealPerSessionPerDay,
        MEALS_DEFAULT.oneMealPerSessionPerDay,
      ),
    });

    const secObj = asObject(map['settings.security']);
    setSecurity({
      maxFailedLogins: asNumber(secObj.maxFailedLogins, SECURITY_DEFAULT.maxFailedLogins),
      lockoutMinutes: asNumber(secObj.lockoutMinutes, SECURITY_DEFAULT.lockoutMinutes),
      sessionTimeoutMinutes: asNumber(
        secObj.sessionTimeoutMinutes,
        SECURITY_DEFAULT.sessionTimeoutMinutes,
      ),
      requireStrongPassword: asBool(
        secObj.requireStrongPassword,
        SECURITY_DEFAULT.requireStrongPassword,
      ),
      allowRememberMe: asBool(secObj.allowRememberMe, SECURITY_DEFAULT.allowRememberMe),
    });

    const notifObj = asObject(map['settings.notifications']);
    setNotifications({
      emailEnabled: asBool(notifObj.emailEnabled, NOTIFICATIONS_DEFAULT.emailEnabled),
      mealAlerts: asBool(notifObj.mealAlerts, NOTIFICATIONS_DEFAULT.mealAlerts),
      duplicateAlerts: asBool(notifObj.duplicateAlerts, NOTIFICATIONS_DEFAULT.duplicateAlerts),
      dailyDigest: asBool(notifObj.dailyDigest, NOTIFICATIONS_DEFAULT.dailyDigest),
      adminEmail: asString(notifObj.adminEmail, NOTIFICATIONS_DEFAULT.adminEmail),
    });

    const brandObj = asObject(map['settings.branding']);
    const logoUrl = asString(brandObj.logoUrl, BRANDING_DEFAULT.logoUrl);
    setBranding({
      accentColor: asString(brandObj.accentColor, BRANDING_DEFAULT.accentColor),
      logoUrl,
      faviconUrl: asString(brandObj.faviconUrl, BRANDING_DEFAULT.faviconUrl),
      supportEmail: asString(brandObj.supportEmail, BRANDING_DEFAULT.supportEmail),
    });
    cacheBrandingLogoUrl(logoUrl);

    const gp = mergeGatePassSettings(map[GATE_PASS_SETTINGS_KEY]);
    setGatePass(gp);
    cacheGatePassSettings(gp);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const orgId = getActiveOrganizationId();
      const q = orgId ? `?organizationId=${orgId}` : '';
      const data = await api<Setting[]>(`/settings${q}`);
      hydrate(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    void load();
  }, [router, load]);

  async function saveKeys(entries: { key: string; value: unknown }[]) {
    setSaving(true);
    try {
      const orgId = getActiveOrganizationId();
      for (const entry of entries) {
        await api('/settings', {
          method: 'PUT',
          body: JSON.stringify({
            key: entry.key,
            value: entry.value,
            ...(orgId ? { organizationId: orgId } : {}),
          }),
        });
      }
      push({ kind: 'success', title: 'Settings saved' });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Try again',
      });
    } finally {
      setSaving(false);
    }
  }

  function onSaveGeneral(e: FormEvent) {
    e.preventDefault();
    void saveKeys([
      { key: 'platform.displayName', value: general.displayName.trim() },
      { key: 'platform.name', value: general.name.trim() },
    ]);
  }

  function onSaveMeals(e: FormEvent) {
    e.preventDefault();
    void saveKeys([{ key: 'settings.meals', value: meals }]);
  }

  function onSaveSecurity(e: FormEvent) {
    e.preventDefault();
    void saveKeys([{ key: 'settings.security', value: security }]);
  }

  function onSaveNotifications(e: FormEvent) {
    e.preventDefault();
    void saveKeys([{ key: 'settings.notifications', value: notifications }]);
  }

  function onSaveBranding(e: FormEvent) {
    e.preventDefault();
    cacheBrandingLogoUrl(branding.logoUrl);
    void saveKeys([{ key: 'settings.branding', value: branding }]);
  }

  function onSaveGatePass(e: FormEvent) {
    e.preventDefault();
    cacheGatePassSettings(gatePass);
    void saveKeys([{ key: GATE_PASS_SETTINGS_KEY, value: gatePass }]);
  }

  return (
    <AppShell>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Organization preferences and configuration.</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`btn btn-sm ${tab === t ? '' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
          >
            {t}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <Skeleton height={28} />
          <Skeleton height={28} />
          <Skeleton height={28} />
        </div>
      ) : null}

      {!loading && tab === 'General' ? (
        <form className="panel settings-form" onSubmit={onSaveGeneral}>
          <div className="settings-fields">
            <Input
              label="Display name"
              value={general.displayName}
              onChange={(e) => setGeneral((g) => ({ ...g, displayName: e.target.value }))}
              required
            />
            <Input
              label="Short name"
              value={general.name}
              onChange={(e) => setGeneral((g) => ({ ...g, name: e.target.value }))}
              required
            />
          </div>
          <div className="settings-actions">
            <Button type="submit" loading={saving}>
              Save general
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && tab === 'Meal Sessions' ? (
        <div className="settings-stack">
          <div className="panel settings-form">
            <h2 className="settings-heading">Session windows</h2>
            <p className="muted" style={{ margin: 0 }}>
              Breakfast, Lunch, and Dinner times are managed on the Meal Sessions page (per campus).
            </p>
            <div>
              <Link href="/meal-sessions" className="btn btn-secondary btn-sm">
                Open Meal Sessions
              </Link>
            </div>
          </div>

          <form className="panel settings-form" onSubmit={onSaveMeals}>
            <h2 className="settings-heading">Distribution behaviour</h2>
            <div className="settings-fields">
              <Input
                label="Default grace period (minutes)"
                type="number"
                min={0}
                value={meals.defaultGraceMinutes}
                onChange={(e) =>
                  setMeals((m) => ({ ...m, defaultGraceMinutes: Number(e.target.value) || 0 }))
                }
              />
              <Input
                label="Scanner auto-reset (seconds)"
                type="number"
                min={1}
                value={meals.scannerAutoResetSeconds}
                onChange={(e) =>
                  setMeals((m) => ({
                    ...m,
                    scannerAutoResetSeconds: Number(e.target.value) || 1,
                  }))
                }
              />
            </div>
            <div className="settings-toggles">
              <Toggle
                label="Play sound on scan result"
                checked={meals.soundEnabled}
                onChange={(v) => setMeals((m) => ({ ...m, soundEnabled: v }))}
              />
              <Toggle
                label="One meal per session per day"
                hint="Blocks duplicate serves for the same student/session/day."
                checked={meals.oneMealPerSessionPerDay}
                onChange={(v) => setMeals((m) => ({ ...m, oneMealPerSessionPerDay: v }))}
              />
              <Toggle
                label="Allow admin meal override"
                checked={meals.allowAdminOverride}
                onChange={(v) => setMeals((m) => ({ ...m, allowAdminOverride: v }))}
              />
              <Toggle
                label="Require reason on override"
                checked={meals.requireOverrideReason}
                onChange={(v) => setMeals((m) => ({ ...m, requireOverrideReason: v }))}
              />
            </div>
            <div className="settings-actions">
              <Button type="submit" loading={saving}>
                Save meal settings
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {!loading && tab === 'Branding' ? (
        <form className="panel settings-form" onSubmit={onSaveBranding}>
          <div className="settings-fields">
            <Input
              label="Accent color"
              type="color"
              value={branding.accentColor || '#111111'}
              onChange={(e) => setBranding((b) => ({ ...b, accentColor: e.target.value }))}
            />
            <Input
              label="Support email"
              type="email"
              value={branding.supportEmail}
              onChange={(e) => setBranding((b) => ({ ...b, supportEmail: e.target.value }))}
            />
            <Input
              label="Logo URL"
              value={branding.logoUrl}
              onChange={(e) => setBranding((b) => ({ ...b, logoUrl: e.target.value }))}
              placeholder="Leave empty to use bundled INSA logo"
            />
            <div className="settings-logo-preview">
              <span className="muted">Preview</span>
              <BrandLogo variant="mark" size={48} />
            </div>
            <Input
              label="Favicon URL"
              value={branding.faviconUrl}
              onChange={(e) => setBranding((b) => ({ ...b, faviconUrl: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <div className="settings-actions">
            <Button type="submit" loading={saving}>
              Save branding
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && tab === 'Gate Pass' ? (
        <form className="panel settings-form" onSubmit={onSaveGatePass}>
          <h2 className="settings-heading">Gate Pass Designer</h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>
            Configure printable A4 gate pass cards (English · Amharic). Field labels are bilingual
            automatically. Use Amharic in header/sub-header/footer — e.g. Gate Pass · የመውጫ ፈቃድ.
          </p>
          <div className="settings-fields">
            <Input
              label="Header text"
              value={gatePass.headerText}
              onChange={(e) => setGatePass((g) => ({ ...g, headerText: e.target.value }))}
            />
            <Input
              label="Sub-header"
              value={gatePass.subHeaderText}
              onChange={(e) => setGatePass((g) => ({ ...g, subHeaderText: e.target.value }))}
            />
            <Input
              label="Footer note"
              value={gatePass.footerText}
              onChange={(e) => setGatePass((g) => ({ ...g, footerText: e.target.value }))}
            />
            <label className="field">
              <span>Default cards per A4</span>
              <select
                className="input"
                value={gatePass.cardsPerPage}
                onChange={(e) =>
                  setGatePass((g) => ({
                    ...g,
                    cardsPerPage: Number(e.target.value) as 1 | 4 | 8,
                  }))
                }
              >
                <option value={8}>8 cards (recommended)</option>
                <option value={4}>4 cards</option>
                <option value={1}>1 card</option>
              </select>
            </label>
          </div>
          <div className="settings-toggles">
            {(
              [
                ['showLogo', 'Show logo'],
                ['showBarcode', 'Show barcode (filled passes only — hidden on blank templates)'],
                ['showQr', 'Show verification mark'],
                ['showCampus', 'Show campus'],
                ['showProgram', 'Show program'],
                ['showDestination', 'Show destination'],
                ['showNotes', 'Show notes'],
                ['showSignature', 'Signature line'],
                ['showStamp', 'Stamp area'],
              ] as const
            ).map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={gatePass[key]}
                onChange={(v) => setGatePass((g) => ({ ...g, [key]: v }))}
              />
            ))}
          </div>
          <div className="settings-actions" style={{ gap: 8 }}>
            <Button type="submit" loading={saving}>
              Save gate pass template
            </Button>
            <Link href="/leave/print?blank=1&layout=8&count=8">
              <Button type="button" variant="secondary">
                Preview blank sheet
              </Button>
            </Link>
          </div>
        </form>
      ) : null}

      {!loading && tab === 'Security' ? (
        <form className="panel settings-form" onSubmit={onSaveSecurity}>
          <div className="settings-fields">
            <Input
              label="Max failed logins before lockout"
              type="number"
              min={1}
              value={security.maxFailedLogins}
              onChange={(e) =>
                setSecurity((s) => ({ ...s, maxFailedLogins: Number(e.target.value) || 1 }))
              }
            />
            <Input
              label="Lockout duration (minutes)"
              type="number"
              min={1}
              value={security.lockoutMinutes}
              onChange={(e) =>
                setSecurity((s) => ({ ...s, lockoutMinutes: Number(e.target.value) || 1 }))
              }
            />
            <Input
              label="Session timeout (minutes)"
              type="number"
              min={15}
              value={security.sessionTimeoutMinutes}
              onChange={(e) =>
                setSecurity((s) => ({
                  ...s,
                  sessionTimeoutMinutes: Number(e.target.value) || 15,
                }))
              }
            />
          </div>
          <div className="settings-toggles">
            <Toggle
              label="Require strong passwords"
              hint="At least 8 characters with mixed case, number, and symbol."
              checked={security.requireStrongPassword}
              onChange={(v) => setSecurity((s) => ({ ...s, requireStrongPassword: v }))}
            />
            <Toggle
              label="Allow “Remember me” on login"
              checked={security.allowRememberMe}
              onChange={(v) => setSecurity((s) => ({ ...s, allowRememberMe: v }))}
            />
          </div>
          <div className="settings-actions">
            <Button type="submit" loading={saving}>
              Save security
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && tab === 'Notifications' ? (
        <form className="panel settings-form" onSubmit={onSaveNotifications}>
          <div className="settings-fields">
            <Input
              label="Admin alert email"
              type="email"
              value={notifications.adminEmail}
              onChange={(e) => setNotifications((n) => ({ ...n, adminEmail: e.target.value }))}
              placeholder="admin@example.com"
              disabled={!notifications.emailEnabled}
            />
          </div>
          <div className="settings-toggles">
            <Toggle
              label="Enable email notifications"
              hint="Requires SMTP configuration on the server."
              checked={notifications.emailEnabled}
              onChange={(v) => setNotifications((n) => ({ ...n, emailEnabled: v }))}
            />
            <Toggle
              label="Meal volume alerts"
              hint="Notify when daily serves spike or drop unusually."
              checked={notifications.mealAlerts}
              onChange={(v) => setNotifications((n) => ({ ...n, mealAlerts: v }))}
            />
            <Toggle
              label="Duplicate scan alerts"
              checked={notifications.duplicateAlerts}
              onChange={(v) => setNotifications((n) => ({ ...n, duplicateAlerts: v }))}
            />
            <Toggle
              label="Daily digest email"
              checked={notifications.dailyDigest}
              onChange={(v) => setNotifications((n) => ({ ...n, dailyDigest: v }))}
              hint="Summary of meals served each day."
            />
          </div>
          <div className="settings-actions">
            <Button type="submit" loading={saving}>
              Save notifications
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && Object.keys(byKey).length === 0 && tab === 'General' ? (
        <p className="muted" style={{ marginTop: 12 }}>
          No stored settings yet — saving will create them.
        </p>
      ) : null}
    </AppShell>
  );
}
