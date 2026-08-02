'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';

type Props = {
  disabled?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
};

/** In-browser voice note recorder (MediaRecorder → webm/ogg). */
export function VoiceNoteRecorder({ disabled, onRecorded }: Props) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        typeof MediaRecorder !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia,
    );
    return () => {
      stopTracks();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg')
            ? 'audio/ogg'
            : '';
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        stopTracks();
        const ext = type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type });
        await onRecorded(file);
      };
      mediaRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone permission is required for voice notes.');
      stopTracks();
    }
  }

  function stop() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
    mediaRef.current = null;
  }

  if (!supported) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        Voice notes need a browser with microphone support.
      </p>
    );
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="voice-recorder">
      {recording ? (
        <>
          <span className="voice-recorder-live" aria-live="polite">
            Recording · {mm}:{ss}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={stop} disabled={disabled}>
            <Square size={14} strokeWidth={1.75} aria-hidden />
            Stop & attach
          </Button>
        </>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => void start()} disabled={disabled}>
          <Mic size={14} strokeWidth={1.75} aria-hidden />
          Record voice note
        </Button>
      )}
      {error ? <span className="error" style={{ fontSize: '0.78rem' }}>{error}</span> : null}
    </div>
  );
}
