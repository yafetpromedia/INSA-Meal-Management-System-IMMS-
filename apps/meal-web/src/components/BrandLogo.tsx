'use client';

import { useEffect, useState } from 'react';

const DEFAULT_MARK = '/brand/insa-mark.png';
const DEFAULT_LOGO = '/brand/insa-logo.png';

type Props = {
  /** Compact circular mark (sidebar) or full header logo (login). */
  variant?: 'mark' | 'logo';
  size?: number;
  className?: string;
  alt?: string;
};

function readBrandingLogoUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('imms_branding_logo');
    if (!raw) return null;
    // Only allow https absolute URLs or same-origin relative paths
    if (raw.startsWith('https://')) return raw;
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return null;
  } catch {
    return null;
  }
}

/** INSA / IMMS brand image. Falls back to bundled assets under /public/brand. */
export function BrandLogo({
  variant = 'mark',
  size = 36,
  className = '',
  alt = 'INSA',
}: Props) {
  const [src, setSrc] = useState(variant === 'logo' ? DEFAULT_LOGO : DEFAULT_MARK);

  useEffect(() => {
    const custom = readBrandingLogoUrl();
    if (custom) setSrc(custom);
    else setSrc(variant === 'logo' ? DEFAULT_LOGO : DEFAULT_MARK);
  }, [variant]);

  if (variant === 'logo') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className={`brand-logo-img ${className}`.trim()} />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`brand-mark-img ${className}`.trim()}
    />
  );
}

/** Persist Settings → Branding logo URL for shell/login (optional override). */
export function cacheBrandingLogoUrl(url: string) {
  if (typeof window === 'undefined') return;
  const trimmed = url.trim();
  if (trimmed) localStorage.setItem('imms_branding_logo', trimmed);
  else localStorage.removeItem('imms_branding_logo');
}
