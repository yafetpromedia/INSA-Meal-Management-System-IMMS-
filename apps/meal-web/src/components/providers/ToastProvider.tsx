'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { pushLocalNotification } from '@/lib/notifications';

type ToastKind = 'success' | 'warning' | 'error' | 'info';

type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  sticky?: boolean;
};

const ToastContext = createContext<{
  push: (toast: Omit<Toast, 'id'>) => void;
}>({ push: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      pushLocalNotification({
        id,
        title: toast.title,
        message: toast.message,
        kind: toast.kind,
      });
      if (!toast.sticky) {
        window.setTimeout(() => dismiss(id), toast.kind === 'error' ? 6000 : 3500);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            <div style={{ flex: 1 }}>
              <strong>{t.title}</strong>
              {t.message ? <div className="muted" style={{ marginTop: 4 }}>{t.message}</div> : null}
            </div>
            {(t.sticky || t.kind === 'error') && (
              <button className="btn-ghost btn-sm" type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
