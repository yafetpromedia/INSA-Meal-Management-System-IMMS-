'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, DoorOpen, ScanLine, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { StatusChip } from '@/components/ui/Badge';
import { api, getActiveOrganizationId } from '@/lib/api';
import { formatLeaveDateTime, leaveStatusLabel, leaveStatusTone } from '@/lib/leave';
import { pushLocalNotification } from '@/lib/notifications';
import { playError, playSuccess } from '@/lib/sounds';
import { formatEthiopiaTime } from '@/lib/timezone';

type GateStudent = {
  id: string;
  studentId: string;
  fullName: string;
  barcode?: string;
  campus?: { name?: string; shortName?: string } | null;
  program?: { name?: string } | null;
};

type GateLeave = {
  id: string;
  leaveNumber: string;
  status: string;
  destination?: string;
  expectedReturnTime?: string;
  leaveType?: { name?: string } | null;
};

type GateScanResult = {
  allowed: boolean;
  reason?: string;
  student?: GateStudent | null;
  leave?: GateLeave | null;
  exitTime?: string | null;
  durationMinutes?: number | null;
};

type RecentEntry = {
  id: string;
  at: string;
  mode: 'exit' | 'return';
  name: string;
  studentId: string;
  ok: boolean;
  detail: string;
};

type ResultState =
  | { kind: 'idle' }
  | {
      kind: 'result';
      mode: 'exit' | 'return';
      result: GateScanResult;
      title: string;
      tone: 'ok' | 'err';
    };

const GATE_LOC_KEY = 'imms_gate_location';

export default function GateScannerPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const resetTimer = useRef<number | null>(null);

  const [mode, setMode] = useState<'exit' | 'return'>('exit');
  const [barcode, setBarcode] = useState('');
  const [gateLocation, setGateLocation] = useState('');
  const [clock, setClock] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ResultState>({ kind: 'idle' });
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  const clearResult = useCallback(() => {
    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    setBarcode('');
    setState({ kind: 'idle' });
    inFlight.current = false;
    setBusy(false);
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    const access =
      localStorage.getItem('imms_access') || sessionStorage.getItem('imms_access');
    if (!access) {
      router.replace('/login');
      return;
    }
    const saved = sessionStorage.getItem(GATE_LOC_KEY) ?? '';
    setGateLocation(saved);
    focusInput();
    const tick = () => setClock(formatEthiopiaTime());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [router, focusInput]);

  useEffect(() => {
    sessionStorage.setItem(GATE_LOC_KEY, gateLocation);
  }, [gateLocation]);

  const pushRecent = useCallback((entry: Omit<RecentEntry, 'id' | 'at'>) => {
    setRecent((prev) =>
      [
        {
          id: `${Date.now()}`,
          at: formatEthiopiaTime(),
          ...entry,
        },
        ...prev,
      ].slice(0, 20),
    );
  }, []);

  const scan = useCallback(
    async (raw: string, scanMode: 'exit' | 'return') => {
      const code = raw.trim();
      if (!code || inFlight.current) return;
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }

      inFlight.current = true;
      setBusy(true);
      setBarcode(code);

      const orgId = getActiveOrganizationId();
      const path = scanMode === 'exit' ? '/gate/exit' : '/gate/return';
      try {
        const result = await api<GateScanResult>(path, {
          method: 'POST',
          body: JSON.stringify({
            barcode: code,
            gateLocation: gateLocation.trim() || undefined,
            organizationId: orgId ?? undefined,
          }),
        });

        const studentName = result.student?.fullName ?? code;
        const studentId = result.student?.studentId ?? code;

        if (result.allowed) {
          playSuccess();
          const title =
            scanMode === 'exit' ? 'Exit Approved' : 'Welcome Back';
          pushLocalNotification({
            kind: 'success',
            title,
            message: `${studentName} · ${result.leave?.leaveType?.name ?? 'Leave'}`,
            href: '/gate',
          });
          setState({ kind: 'result', mode: scanMode, result, title, tone: 'ok' });
          pushRecent({
            mode: scanMode,
            name: studentName,
            studentId,
            ok: true,
            detail:
              scanMode === 'exit'
                ? result.leave?.destination ?? 'Exit'
                : result.durationMinutes != null
                  ? `${Math.round(result.durationMinutes)}m outside`
                  : 'Returned',
          });
        } else {
          playError();
          const title =
            scanMode === 'exit' ? 'Exit Not Allowed' : 'Return Not Allowed';
          const reason = result.reason ?? 'Not allowed';
          pushLocalNotification({
            kind: 'error',
            title,
            message: `${studentName} · ${reason}`,
            href: '/gate',
          });
          setState({ kind: 'result', mode: scanMode, result, title, tone: 'err' });
          pushRecent({
            mode: scanMode,
            name: studentName,
            studentId,
            ok: false,
            detail: reason,
          });
        }
      } catch (err) {
        playError();
        const message = err instanceof Error ? err.message : 'Scan failed';
        pushLocalNotification({
          kind: 'error',
          title: 'Scan failed',
          message: `${code} · ${message}`,
          href: '/gate',
        });
        setState({
          kind: 'result',
          mode: scanMode,
          result: { allowed: false, reason: message },
          title: 'Scan failed',
          tone: 'err',
        });
        pushRecent({
          mode: scanMode,
          name: code,
          studentId: code,
          ok: false,
          detail: message,
        });
      } finally {
        inFlight.current = false;
        setBusy(false);
        setBarcode('');
        focusInput();
        resetTimer.current = window.setTimeout(() => clearResult(), 2200);
      }
    },
    [clearResult, focusInput, gateLocation, pushRecent],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    void scan(barcode, mode);
  }

  const result = state.kind === 'result' ? state.result : null;
  const student = result?.student;
  const leave = result?.leave;

  return (
    <AppShell>
      <div className="meal-page">
        <header className="meal-page-head">
          <div>
            <h1 className="page-title">Gate Scanner</h1>
            <p className="page-sub meal-page-sub">Scan → approve exit / welcome back → next</p>
          </div>
          <div className="meal-meta">
            <div className="meal-pill">
              <DoorOpen size={14} strokeWidth={1.75} aria-hidden />
              <input
                className="input"
                style={{
                  border: 0,
                  background: 'transparent',
                  padding: '0 4px',
                  minWidth: 120,
                  height: 'auto',
                  fontSize: '0.85rem',
                }}
                value={gateLocation}
                onChange={(e) => setGateLocation(e.target.value)}
                placeholder="Gate location"
                aria-label="Gate location"
              />
            </div>
            <div className="meal-pill">
              <Clock size={14} strokeWidth={1.75} aria-hidden />
              <span className="meal-clock">{clock || '—'}</span>
            </div>
          </div>
        </header>

        <div className="meal-layout">
          <section className="meal-main meal-main-station" aria-label="Gate scanner">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 14,
              }}
              role="group"
              aria-label="Scan mode"
            >
              <button
                type="button"
                className={`btn ${mode === 'exit' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setMode('exit');
                  clearResult();
                }}
              >
                Exit
              </button>
              <button
                type="button"
                className={`btn ${mode === 'return' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setMode('return');
                  clearResult();
                }}
              >
                Return
              </button>
            </div>

            <form className="meal-scan" onSubmit={onSubmit}>
              <div className="meal-scan-label">
                <ScanLine size={16} strokeWidth={1.75} aria-hidden />
                <span>
                  {mode === 'exit' ? 'Exit scan' : 'Return scan'} · student barcode or leave # (LV-…)
                </span>
              </div>
              <input
                id="gate-barcode"
                ref={inputRef}
                className="barcode-input"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan barcode or type student ID"
                autoComplete="off"
                autoFocus
                aria-label="Gate barcode scanner input"
                disabled={busy}
              />
              <p className="meal-hint muted">
                Press Enter after each scan — input clears and refocuses automatically
              </p>
            </form>

            {state.kind === 'idle' ? (
              <div className="meal-idle meal-idle-compact">
                <ScanLine size={22} strokeWidth={1.5} aria-hidden />
                <p>{busy ? 'Processing…' : `Ready for ${mode} scan`}</p>
              </div>
            ) : (
              <div
                className={`meal-gate-popup gate-result-inline meal-gate-tone ${state.tone}`}
                style={{ position: 'relative', inset: 'auto', width: '100%', maxWidth: 'none', marginTop: 8 }}
                role="status"
                aria-live="polite"
              >
                <div className="meal-gate-body">
                  <div className={`meal-gate-icon ${state.tone}`} aria-hidden>
                    {state.tone === 'ok' ? <Check size={22} strokeWidth={2} /> : <X size={22} strokeWidth={2} />}
                  </div>
                  <div className="meal-gate-center">
                    <div className={`meal-gate-banner ${state.tone}`}>
                      <strong>{state.title}</strong>
                      {result?.reason && state.tone === 'err' ? (
                        <span>{result.reason}</span>
                      ) : null}
                    </div>
                    {student ? (
                      <>
                        <p className="meal-gate-name">{student.fullName}</p>
                        <p className="meal-gate-id">
                          {student.studentId}
                          {student.program?.name ? ` · ${student.program.name}` : ''}
                          {student.campus?.shortName || student.campus?.name
                            ? ` · ${student.campus.shortName ?? student.campus.name}`
                            : ''}
                        </p>
                      </>
                    ) : null}
                    {leave ? (
                      <div className="meal-gate-chips">
                        <StatusChip tone={leaveStatusTone(leave.status)}>
                          {leave.leaveType?.name ?? leaveStatusLabel(leave.status)}
                        </StatusChip>
                        {leave.destination ? (
                          <StatusChip tone="info">{leave.destination}</StatusChip>
                        ) : null}
                        {leave.expectedReturnTime ? (
                          <StatusChip tone="info">
                            Return {formatLeaveDateTime(leave.expectedReturnTime)}
                          </StatusChip>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="meal-side" aria-label="Recent gate activity">
            <div className="meal-side-head">
              <h2>Recent</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setRecent([]);
                  clearResult();
                }}
              >
                Clear
              </button>
            </div>
            {recent.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                Scans appear here (last 20).
              </p>
            ) : (
              <ul className="meal-recent">
                {recent.map((r) => (
                  <li key={r.id}>
                    <div className="recent-scan-main">
                      <strong>{r.name}</strong>
                      <span className="muted">{r.studentId}</span>
                    </div>
                    <div className="recent-scan-meta">
                      <StatusChip tone={r.ok ? 'success' : 'error'}>
                        {r.mode === 'exit' ? 'Exit' : 'Return'}
                      </StatusChip>
                      <span className="muted">{r.at}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>
                      {r.detail}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
