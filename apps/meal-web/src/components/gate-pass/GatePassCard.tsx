'use client';

import { BrandLogo } from '@/components/BrandLogo';
import { formatLeaveDate, formatLeaveDateTime } from '@/lib/leave';
import type { GatePassCardData, GatePassTemplateSettings } from '@/lib/gate-pass-print';

type Props = {
  data: GatePassCardData;
  settings: GatePassTemplateSettings;
  /** 1-based index on the sheet for cut labels */
  slot?: number;
};

function Field({
  label,
  value,
  blank,
  mono,
}: {
  label: string;
  value?: string;
  blank?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="gpc-field">
      <span className="gpc-label">{label}</span>
      <span className={`gpc-value ${mono ? 'is-mono' : ''} ${blank ? 'is-blank' : ''}`}>
        {blank ? '' : value || '—'}
      </span>
    </div>
  );
}

/** Compact printable gate-pass card (~90×65mm target). */
export function GatePassCard({ data, settings, slot }: Props) {
  const blank = Boolean(data.blank);
  const verify = blank
    ? ''
    : data.leaveNumber || data.barcode || data.studentId;

  return (
    <article className={`gpc-card ${blank ? 'is-blank-card' : ''}`}>
      <header className="gpc-head">
        {settings.showLogo ? (
          <BrandLogo variant="mark" size={28} className="gpc-logo" alt="INSA" />
        ) : (
          <span className="gpc-logo-spacer" aria-hidden />
        )}
        <div className="gpc-titles">
          <p className="gpc-org">{settings.headerText}</p>
          <p className="gpc-pass">{settings.subHeaderText}</p>
        </div>
        <div className="gpc-meta">
          {slot != null ? <span className="gpc-slot">#{slot}</span> : null}
          {!blank && data.leaveNumber ? (
            <strong className="gpc-number">{data.leaveNumber}</strong>
          ) : blank ? (
            <span className="gpc-number is-blank" />
          ) : null}
        </div>
      </header>

      <div className="gpc-body">
        <Field label="Student Name" value={data.studentName} blank={blank} />
        <Field label="Student ID" value={data.studentId} blank={blank} mono />
        {settings.showBarcode ? (
          <Field label="Barcode" value={data.barcode} blank={blank} mono />
        ) : null}
        {settings.showCampus ? (
          <Field label="Campus" value={data.campus} blank={blank} />
        ) : null}
        {settings.showProgram ? (
          <Field label="Program" value={data.program} blank={blank} />
        ) : null}
        <Field label="Leave Type" value={data.leaveType} blank={blank} />
        {settings.showDestination ? (
          <Field label="Destination" value={data.destination} blank={blank} />
        ) : null}
        <Field
          label="Exit Time"
          value={blank ? '' : formatLeaveDateTime(data.exitTime)}
          blank={blank}
        />
        <Field
          label="Expected Return"
          value={blank ? '' : formatLeaveDateTime(data.returnTime)}
          blank={blank}
        />
        <Field
          label="Date"
          value={blank ? '' : formatLeaveDate(data.dateLabel || data.exitTime)}
          blank={blank}
        />
        <Field label="Approved By" value={data.approvedBy} blank={blank} />
        {settings.showNotes && !blank && data.notes ? (
          <Field label="Notes" value={data.notes} />
        ) : null}
        {blank ? <Field label="Gate Officer" blank /> : null}
        {blank ? <Field label="Remarks" blank /> : null}
      </div>

      <footer className="gpc-foot">
        {settings.showSignature ? (
          <div className="gpc-sign">
            <span className="gpc-label">Signature</span>
            <span className="gpc-line" />
          </div>
        ) : null}
        {settings.showStamp ? (
          <div className="gpc-stamp">
            <span className="gpc-label">Stamp</span>
          </div>
        ) : null}
        <div className="gpc-verify">
          {settings.showQr && verify ? (
            <div className="gpc-qr-box" aria-hidden title={verify}>
              {verify
                .slice(0, 12)
                .split('')
                .map((ch, i) => (
                  <span
                    key={`${ch}-${i}`}
                    className="gpc-qr-bar"
                    style={{ opacity: 0.35 + ((ch.charCodeAt(0) + i) % 5) * 0.12 }}
                  />
                ))}
            </div>
          ) : null}
          <div>
            <span className="gpc-label">Verification</span>
            <strong className={`gpc-verify-code ${blank ? 'is-blank' : ''}`}>
              {blank ? '' : verify}
            </strong>
          </div>
        </div>
      </footer>

      {settings.footerText && !blank ? (
        <p className="gpc-footer-note">{settings.footerText}</p>
      ) : null}
    </article>
  );
}
