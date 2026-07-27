'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Button } from '@/components/ui/Button';

type Props = {
  onDetect: (code: string) => void;
  /** Pause decoding while verifying/serving (video stays live) */
  paused?: boolean;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
};

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

function friendlyCameraError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('permission') || lower.includes('notallowed') || lower.includes('denied')) {
    return 'Camera permission blocked. Allow camera for this site, then tap Start camera.';
  }
  if (lower.includes('notfound') || lower.includes('requested device not found')) {
    return 'No camera found. Plug in a webcam or use a phone, then try again.';
  }
  if (lower.includes('notreadable') || lower.includes('trackstart') || lower.includes('in use')) {
    return 'Camera is in use by another app. Close it, then tap Retry.';
  }
  if (lower.includes('secure') || lower.includes('https')) {
    return 'Camera needs HTTPS or localhost.';
  }
  return raw || 'Could not open camera. Tap Retry or use USB scanner / type ID.';
}

async function pickCameraId(): Promise<string | { facingMode: string } | null> {
  try {
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) return null;
    const back = cameras.find((c) => /back|rear|environment|trás|arrière/i.test(c.label));
    return (back ?? cameras[0])!.id;
  } catch {
    // Permission may be needed before labels appear — try facingMode next
    return null;
  }
}

export function BarcodeCamera({ onDetect, paused = false, enabled = true, onEnabledChange }: Props) {
  const regionId = useRef(`imms-cam-${Math.random().toString(36).slice(2, 9)}`).current;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastCodeRef = useRef('');
  const lastAtRef = useRef(0);
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  const runIdRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let cancelled = false;
    const runId = ++runIdRef.current;

    async function stopScanner() {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (!scanner) return;
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        // ignore
      }
      try {
        scanner.clear();
      } catch {
        // ignore
      }
    }

    async function startOnCamera(
      scanner: Html5Qrcode,
      camera: string | MediaTrackConstraints,
    ) {
      await scanner.start(
        camera,
        {
          fps: 10,
          qrbox: (viewW, viewH) => {
            const width = Math.min(Math.floor(viewW * 0.88), 400);
            const height = Math.min(Math.floor(viewH * 0.36), 160);
            return { width: Math.max(width, 120), height: Math.max(height, 80) };
          },
          aspectRatio: 1.777,
          disableFlip: false,
        },
        (decodedText) => {
          if (pausedRef.current) return;
          const code = decodedText.trim();
          if (!code) return;
          const now = Date.now();
          if (code === lastCodeRef.current && now - lastAtRef.current < 2000) return;
          lastCodeRef.current = code;
          lastAtRef.current = now;
          onDetectRef.current(code);
        },
        () => undefined,
      );
    }

    async function startScanner() {
      if (!enabled || typeof window === 'undefined') return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not supported in this browser. Use Chrome/Edge or type the student ID.');
        return;
      }

      setStarting(true);
      setError('');
      setRunning(false);

      // Let the viewport mount (and settle after React Strict Mode remount)
      await new Promise((r) => window.setTimeout(r, 120));
      if (cancelled || runId !== runIdRef.current) return;

      const el = document.getElementById(regionId);
      if (!el) {
        setError('Camera view failed to load. Tap Retry.');
        setStarting(false);
        return;
      }

      await stopScanner();
      if (cancelled || runId !== runIdRef.current) return;

      const scanner = new Html5Qrcode(regionId, {
        formatsToSupport: FORMATS,
        verbose: false,
      });
      scannerRef.current = scanner;

      const attempts: Array<string | MediaTrackConstraints> = [];
      const picked = await pickCameraId();
      if (typeof picked === 'string') attempts.push(picked);
      attempts.push({ facingMode: { ideal: 'environment' } });
      attempts.push({ facingMode: 'user' });
      attempts.push({ facingMode: 'environment' });

      let lastErr: unknown;
      for (const camera of attempts) {
        if (cancelled || runId !== runIdRef.current) return;
        try {
          await startOnCamera(scanner, camera);
          if (!cancelled && runId === runIdRef.current) {
            setRunning(true);
            setError('');
          }
          setStarting(false);
          return;
        } catch (err) {
          lastErr = err;
          try {
            if (scanner.isScanning) await scanner.stop();
          } catch {
            // ignore between attempts
          }
        }
      }

      if (!cancelled && runId === runIdRef.current) {
        setError(friendlyCameraError(lastErr));
        setRunning(false);
        try {
          scanner.clear();
        } catch {
          // ignore
        }
        scannerRef.current = null;
      }
      setStarting(false);
    }

    if (enabled) void startScanner();
    else {
      void stopScanner().then(() => {
        if (!cancelled) {
          setRunning(false);
          setStarting(false);
        }
      });
    }

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [enabled, regionId, retryKey]);

  return (
    <div className="barcode-camera">
      <div className="barcode-camera-toolbar">
        <span className="meal-scan-label">
          <Camera size={16} strokeWidth={1.75} aria-hidden />
          <span>Camera</span>
        </span>
        <div className="barcode-camera-actions">
          {enabled && error ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={starting}
              onClick={() => setRetryKey((k) => k + 1)}
            >
              <RefreshCw size={14} strokeWidth={1.75} aria-hidden />
              Retry
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={starting}
            onClick={() => {
              if (enabled) onEnabledChange?.(false);
              else {
                setError('');
                onEnabledChange?.(true);
              }
            }}
          >
            {enabled ? (
              <>
                <CameraOff size={14} strokeWidth={1.75} aria-hidden />
                Stop
              </>
            ) : (
              <>
                <Camera size={14} strokeWidth={1.75} aria-hidden />
                Start camera
              </>
            )}
          </Button>
        </div>
      </div>

      {enabled ? (
        <div className={`barcode-camera-frame ${running ? 'is-live' : ''}`}>
          <div id={regionId} className="barcode-camera-viewport" />
          {!running && !error ? (
            <div className="barcode-camera-overlay">Starting camera…</div>
          ) : null}
          {paused && running ? (
            <div className="barcode-camera-overlay">Paused — finish or dismiss popup</div>
          ) : null}
        </div>
      ) : (
        <div className="barcode-camera-off muted">
          Camera off — tap <strong>Start camera</strong>, or use a USB scanner / type the ID below.
        </div>
      )}

      {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}
      {enabled && running && !error ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
          Hold the barcode steady in the frame. Works with laptop webcam or phone rear camera.
        </p>
      ) : null}
    </div>
  );
}
