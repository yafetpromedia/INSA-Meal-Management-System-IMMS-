'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type Props = {
  value: string;
  className?: string;
  /** Show human-readable text under bars */
  displayValue?: boolean;
  height?: number;
};

/** Code128 barcode for printable gate passes (student barcode / ID). */
export function PrintableBarcode({
  value,
  className,
  displayValue = true,
  height = 32,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !value.trim()) return;
    try {
      JsBarcode(el, value.trim(), {
        format: 'CODE128',
        displayValue,
        fontSize: 8,
        height,
        margin: 0,
        width: height <= 20 ? 0.9 : 1.15,
        textMargin: 1,
        background: 'transparent',
        lineColor: '#111',
      });
    } catch {
      el.replaceChildren();
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '12');
      text.setAttribute('font-size', '9');
      text.textContent = value;
      el.appendChild(text);
    }
  }, [value, displayValue, height]);

  if (!value.trim()) return null;

  return (
    <svg
      ref={ref}
      className={className}
      role="img"
      aria-label={`Barcode ${value}`}
    />
  );
}
