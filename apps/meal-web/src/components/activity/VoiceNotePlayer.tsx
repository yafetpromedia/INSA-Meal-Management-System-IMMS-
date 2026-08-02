'use client';

import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { apiBlob } from '@/lib/api';

type Props = {
  mediaId: string;
  caption?: string | null;
};

/** Loads and plays an activity audio attachment. */
export function VoiceNotePlayer({ mediaId, caption }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    void apiBlob(`/activity-reports/media/${mediaId}/file`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Could not load audio');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);

  if (error) return <p className="error" style={{ margin: 0, fontSize: '0.78rem' }}>{error}</p>;
  if (!url) {
    return (
      <div className="activity-gallery-file">
        <Mic size={18} strokeWidth={1.75} aria-hidden />
        <span>Loading…</span>
      </div>
    );
  }

  return (
    <div className="voice-player">
      <div className="voice-player-badge">
        <Mic size={14} strokeWidth={1.75} aria-hidden />
        Voice note
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio controls src={url} preload="metadata" aria-label={caption || 'Voice note'} />
    </div>
  );
}
