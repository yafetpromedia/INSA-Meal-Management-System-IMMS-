'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Props = {
  value: string;
  className?: string;
  size?: number;
  title?: string;
};

/** QR code image for leave verification number (scan at Gate Scanner). */
export function PrintableQr({ value, className, size = 64, title }: Props) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    const text = value.trim();
    if (!text) {
      setSrc('');
      return;
    }
    void QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: size * 2,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return <div className={className} aria-hidden title={title || value} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title || `QR ${value}`}
      className={className}
      width={size}
      height={size}
    />
  );
}
