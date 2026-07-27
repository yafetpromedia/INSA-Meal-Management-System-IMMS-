'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Clock,
  ScanLine,
  UtensilsCrossed,
  X,
  AlertTriangle,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { BarcodeCamera } from '@/components/BarcodeCamera';
import { StatusChip } from '@/components/ui/Badge';
import { api, getActiveOrganizationId } from '@/lib/api';
import { playError, playSuccess, playWarning } from '@/lib/sounds';
import { APP_TIMEZONE_LABEL, formatEthiopiaTime } from '@/lib/timezone';

type Student = {
  id: string;
  studentId: string;
  barcode: string;
  fullName: string;
  department?: string | null;
  campus?: { name: string; shortName: string };
  program?: { name: string };
};

type VerifyResult = {
  eligible: boolean;
  reason?: string;
  student: Student;
  mealSession: string | null;
  mealCode?: string;
};

type RecentScan = {
  id: string;
  at: string;
  name: string;
  studentId: string;
  status: 'served' | 'duplicate' | 'not_found' | 'rejected';
  mealSession?: string | null;
};

type GateState =
  | { kind: 'idle' }
  | {
      kind: 'serving';
      student: Student;
      mealSession: string | null;
    }
  | {
      kind: 'success';
      name: string;
      studentId: string;
      meal: string;
      time: string;
    }
  | {
      kind: 'duplicate';
      student?: Student | null;
      meal: string;
      time?: string;
      message?: string;
    }
  | {
      kind: 'blocked';
      student?: Student | null;
      message: string;
    }
  | { kind: 'not_found'; code: string; message: string };

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function clockShort() {
  return formatEthiopiaTime(new Date(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function MealsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<number | null>(null);
  const inFlight = useRef(false);

  const [barcode, setBarcode] = useState('');
  const [currentMeal, setCurrentMeal] = useState<string | null>(null);
  const [clock, setClock] = useState('');
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState<GateState>({ kind: 'idle' });
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [cameraOn, setCameraOn] = useState(false);

  const popupOpen = gate.kind !== 'idle';

  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  const clearStation = useCallback(() => {
    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    setBarcode('');
    setGate({ kind: 'idle' });
    inFlight.current = false;
    setBusy(false);
    focusInput();
  }, [focusInput]);

  const scheduleClear = useCallback(
    (ms: number) => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => clearStation(), ms);
    },
    [clearStation],
  );

  useEffect(() => {
    if (!localStorage.getItem('imms_access')) {
      router.replace('/login');
      return;
    }
    const orgId = getActiveOrganizationId();
    const q = orgId ? `?organizationId=${orgId}` : '';
    api<string | null>(`/meals/current${q}`)
      .then((code) => setCurrentMeal(code))
      .catch(() => setCurrentMeal(null));
    focusInput();

    const tick = () => setClock(formatEthiopiaTime());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [router, focusInput]);

  useEffect(() => {
    if (!popupOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearStation();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popupOpen, clearStation]);

  const pushRecent = useCallback((entry: Omit<RecentScan, 'id' | 'at'>) => {
    setRecent((prev) =>
      [
        {
          id: `${Date.now()}`,
          at: clockShort(),
          ...entry,
        },
        ...prev,
      ].slice(0, 12),
    );
  }, []);

  const serveStudent = useCallback(
    async (student: Student, mealSession: string | null) => {
      const orgId = getActiveOrganizationId();
      try {
        await api('/meals/serve', {
          method: 'POST',
          body: JSON.stringify({ barcode: student.barcode, organizationId: orgId }),
        });
        playSuccess();
        const time = clockShort();
        setGate({
          kind: 'success',
          name: student.fullName,
          studentId: student.studentId,
          meal: mealSession ?? currentMeal ?? 'Meal',
          time,
        });
        pushRecent({
          name: student.fullName,
          studentId: student.studentId,
          status: 'served',
          mealSession: mealSession ?? currentMeal,
        });
        // Brief success flash, then ready for next scan
        scheduleClear(900);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Serve failed';
        if (message.toLowerCase().includes('duplicate')) {
          playWarning();
          setGate({
            kind: 'duplicate',
            student,
            meal: mealSession ?? currentMeal ?? 'Meal',
            time: clockShort(),
            message,
          });
          pushRecent({
            name: student.fullName,
            studentId: student.studentId,
            status: 'duplicate',
            mealSession: mealSession ?? currentMeal,
          });
          scheduleClear(1600);
        } else {
          playError();
          setGate({ kind: 'blocked', student, message });
          pushRecent({
            name: student.fullName,
            studentId: student.studentId,
            status: 'rejected',
            mealSession: mealSession ?? currentMeal,
          });
          scheduleClear(1600);
        }
      }
    },
    [currentMeal, pushRecent, scheduleClear],
  );

  const verifyBarcode = useCallback(
    async (value: string) => {
      const code = value.trim();
      if (!code || inFlight.current) return;
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }

      inFlight.current = true;
      setBusy(true);
      setBarcode(code);

      const orgId = getActiveOrganizationId();
      try {
        const result = await api<VerifyResult>('/meals/verify', {
          method: 'POST',
          body: JSON.stringify({ barcode: code, organizationId: orgId }),
        });

        if (!result.eligible && result.reason?.toLowerCase().includes('duplicate')) {
          playWarning();
          setGate({
            kind: 'duplicate',
            student: result.student,
            meal: result.mealSession ?? currentMeal ?? 'Meal',
            time: clockShort(),
            message: result.reason,
          });
          pushRecent({
            name: result.student.fullName,
            studentId: result.student.studentId,
            status: 'duplicate',
            mealSession: result.mealSession,
          });
          scheduleClear(1600);
          return;
        }

        if (!result.eligible) {
          playWarning();
          setGate({
            kind: 'blocked',
            student: result.student,
            message: result.reason ?? 'Not eligible',
          });
          pushRecent({
            name: result.student.fullName,
            studentId: result.student.studentId,
            status: 'rejected',
            mealSession: result.mealSession,
          });
          scheduleClear(1600);
          return;
        }

        // Eligible → auto-serve immediately
        setGate({
          kind: 'serving',
          student: result.student,
          mealSession: result.mealSession,
        });
        await serveStudent(result.student, result.mealSession);
      } catch (err) {
        playError();
        const message = err instanceof Error ? err.message : 'Student Not Found';
        setGate({
          kind: 'not_found',
          code,
          message: message.includes('Not Found') ? 'Student not found' : message,
        });
        pushRecent({
          name: code,
          studentId: code,
          status: 'not_found',
        });
        scheduleClear(1400);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [currentMeal, pushRecent, scheduleClear, serveStudent],
  );

  const onCameraDetect = useCallback(
    (code: string) => {
      void verifyBarcode(code);
    },
    [verifyBarcode],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (popupOpen || busy) return;
    void verifyBarcode(barcode);
  }

  return (
    <AppShell>
      <div className="meal-page">
        <header className="meal-page-head">
          <div>
            <h1 className="page-title">Meal Distribution</h1>
            <p className="page-sub meal-page-sub">Scan → auto-serve → next</p>
          </div>
          <div className="meal-meta">
            <div className={`meal-pill ${currentMeal ? 'is-live' : ''}`}>
              <UtensilsCrossed size={14} strokeWidth={1.75} aria-hidden />
              <span>{currentMeal ?? 'No active session'}</span>
            </div>
            <div className="meal-pill">
              <Clock size={14} strokeWidth={1.75} aria-hidden />
              <span className="meal-clock">
                {clock} {APP_TIMEZONE_LABEL}
              </span>
            </div>
          </div>
        </header>

        <div className="meal-layout">
          <section className="meal-main meal-main-station" aria-label="Scanner station">
            <BarcodeCamera
              enabled={cameraOn}
              onEnabledChange={setCameraOn}
              paused={busy || popupOpen}
              onDetect={onCameraDetect}
            />

            <form className="meal-scan" onSubmit={onSubmit}>
              <div className="meal-scan-label">
                <ScanLine size={16} strokeWidth={1.75} aria-hidden />
                <span>Or type / USB scanner</span>
              </div>
              <input
                id="barcode"
                ref={inputRef}
                className="barcode-input"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type student ID, then Enter"
                autoComplete="off"
                autoFocus
                aria-label="Barcode scanner input"
                disabled={busy || popupOpen}
              />
              <p className="meal-hint muted">
                Eligible students are served automatically — ready for the next scan
              </p>
            </form>

            <div className="meal-idle meal-idle-compact">
              <ScanLine size={22} strokeWidth={1.5} aria-hidden />
              <p>
                {busy
                  ? 'Processing…'
                  : cameraOn
                    ? 'Point camera at barcode — eligible meals serve automatically'
                    : 'Ready for USB scan or typed ID'}
              </p>
            </div>
          </section>

          <aside className="meal-side" aria-label="Recent scans">
            <div className="meal-side-head">
              <h2>Recent</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setRecent([]);
                  clearStation();
                }}
              >
                Clear
              </button>
            </div>
            <div className="recent-scans">
              {recent.length === 0 ? (
                <p className="meal-side-empty muted">No scans yet</p>
              ) : (
                recent.map((r) => (
                  <div key={r.id} className={`recent-scan is-${r.status}`}>
                    <div className="recent-scan-main">
                      <strong>{r.name}</strong>
                      <span className="muted">
                        {r.studentId}
                        {r.mealSession ? ` · ${r.mealSession}` : ''}
                      </span>
                    </div>
                    <div className="recent-scan-meta">
                      <StatusChip
                        tone={
                          r.status === 'served'
                            ? 'success'
                            : r.status === 'duplicate'
                              ? 'warning'
                              : 'error'
                        }
                      >
                        {r.status.replace('_', ' ')}
                      </StatusChip>
                      <span className="muted">{r.at}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>

      {popupOpen ? (
        <div
          className={`meal-gate-backdrop meal-gate-${gate.kind}`}
          role="presentation"
          onClick={() => {
            if (gate.kind !== 'serving') clearStation();
          }}
        >
          <div
            className="meal-gate-popup"
            role="dialog"
            aria-modal="true"
            aria-label="Meal result"
            onClick={(e) => e.stopPropagation()}
          >
            {gate.kind === 'serving' ? (
              <>
                <div className="meal-gate-tone ok" aria-hidden />
                <div className="meal-gate-body">
                  <div className="meal-gate-avatar" aria-hidden>
                    {initials(gate.student.fullName)}
                  </div>
                  <h2 className="meal-gate-name">{gate.student.fullName}</h2>
                  <p className="meal-gate-id muted">
                    {gate.student.studentId}
                    <span aria-hidden> · </span>
                    {gate.student.barcode}
                  </p>
                  <div className="meal-chips meal-gate-chips">
                    <StatusChip tone="info">
                      {gate.student.program?.name ?? 'Program'}
                    </StatusChip>
                    <StatusChip tone="info">
                      {gate.student.campus?.shortName ??
                        gate.student.campus?.name ??
                        'Campus'}
                    </StatusChip>
                    {gate.student.department ? (
                      <StatusChip tone="info">{gate.student.department}</StatusChip>
                    ) : null}
                  </div>
                  <div className="meal-gate-banner ok">
                    <Check size={20} strokeWidth={2.25} aria-hidden />
                    <div>
                      <strong>Eligible — serving…</strong>
                      <span>{gate.mealSession ?? currentMeal ?? 'Meal'}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {gate.kind === 'success' ? (
              <>
                <div className="meal-gate-tone ok" aria-hidden />
                <div className="meal-gate-body meal-gate-center">
                  <div className="meal-gate-icon ok" aria-hidden>
                    <Check size={36} strokeWidth={2.5} />
                  </div>
                  <h2 className="meal-gate-name">Meal served</h2>
                  <p className="meal-gate-id">
                    {gate.name}
                    <br />
                    <span className="muted">
                      {gate.studentId} · {gate.meal} · {gate.time}
                    </span>
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                    Ready for next scan…
                  </p>
                </div>
              </>
            ) : null}

            {gate.kind === 'duplicate' ? (
              <>
                <div className="meal-gate-tone warn" aria-hidden />
                <div className="meal-gate-body meal-gate-center">
                  <div className="meal-gate-icon warn" aria-hidden>
                    <AlertTriangle size={32} strokeWidth={2.25} />
                  </div>
                  <h2 className="meal-gate-name">Already served</h2>
                  <p className="meal-gate-id">
                    {gate.student?.fullName ?? 'This student'}
                    <br />
                    <span className="muted">
                      {gate.meal}
                      {gate.time ? ` · ${gate.time}` : ''}
                    </span>
                  </p>
                </div>
              </>
            ) : null}

            {gate.kind === 'blocked' ? (
              <>
                <div className="meal-gate-tone err" aria-hidden />
                <div className="meal-gate-body meal-gate-center">
                  <div className="meal-gate-icon err" aria-hidden>
                    <X size={32} strokeWidth={2.5} />
                  </div>
                  <h2 className="meal-gate-name">Not eligible</h2>
                  <p className="meal-gate-id">
                    {gate.student?.fullName ?? 'Student'}
                    <br />
                    <span className="muted">{gate.message}</span>
                  </p>
                </div>
              </>
            ) : null}

            {gate.kind === 'not_found' ? (
              <>
                <div className="meal-gate-tone err" aria-hidden />
                <div className="meal-gate-body meal-gate-center">
                  <div className="meal-gate-icon err" aria-hidden>
                    <X size={32} strokeWidth={2.5} />
                  </div>
                  <h2 className="meal-gate-name">Not found</h2>
                  <p className="meal-gate-id muted">{gate.code}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
