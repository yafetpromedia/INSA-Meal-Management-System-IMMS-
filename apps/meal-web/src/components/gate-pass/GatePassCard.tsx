'use client';

import { BrandLogo } from '@/components/BrandLogo';
import { formatLeaveDate, formatLeaveDateTime } from '@/lib/leave';
import {
  GATE_PASS_LABELS,
  type GatePassCardData,
  type GatePassLabelKey,
  type GatePassTemplateSettings,
} from '@/lib/gate-pass-print';

type Props = {
  data: GatePassCardData;
  settings: GatePassTemplateSettings;
  /** 1-based index on the sheet for cut labels */
  slot?: number;
};

function BilingualLabel({ labelKey }: { labelKey: GatePassLabelKey }) {
  const { en, am } = GATE_PASS_LABELS[labelKey];
  return (
    <span className="gpc-label">
      <span className="gpc-label-en">{en}</span>
      <span className="gpc-label-am" lang="am">
        {am}
      </span>
    </span>
  );
}

function Field({
  labelKey,
  value,
  blank,
  mono,
  wide,
}: {
  labelKey: GatePassLabelKey;
  value?: string;
  blank?: boolean;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`gpc-field ${wide ? 'is-wide' : ''}`}>
      <BilingualLabel labelKey={labelKey} />
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
  // Handwritten cards cannot include a barcode — only show on filled digital/printouts
  const showBarcode = settings.showBarcode && !blank;

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
            <>
              <BilingualLabel labelKey="passNo" />
              <span className="gpc-number is-blank" />
            </>
          ) : null}
        </div>
      </header>

      <div className="gpc-body">
        <Field labelKey="studentName" value={data.studentName} blank={blank} />
        <Field labelKey="studentId" value={data.studentId} blank={blank} mono />
        {showBarcode ? (
          <Field labelKey="barcode" value={data.barcode} blank={false} mono />
        ) : null}
        {settings.showCampus ? (
          <Field labelKey="campus" value={data.campus} blank={blank} />
        ) : null}
        {settings.showProgram ? (
          <Field labelKey="program" value={data.program} blank={blank} />
        ) : null}
        <Field labelKey="leaveType" value={data.leaveType} blank={blank} />
        {settings.showDestination ? (
          <Field labelKey="destination" value={data.destination} blank={blank} />
        ) : null}
        <Field
          labelKey="exitTime"
          value={blank ? '' : formatLeaveDateTime(data.exitTime)}
          blank={blank}
        />
        <Field
          labelKey="expectedReturn"
          value={blank ? '' : formatLeaveDateTime(data.returnTime)}
          blank={blank}
        />
        <Field
          labelKey="date"
          value={blank ? '' : formatLeaveDate(data.dateLabel || data.exitTime)}
          blank={blank}
        />
        <Field labelKey="approvedBy" value={data.approvedBy} blank={blank} />
        {settings.showNotes && !blank && data.notes ? (
          <Field labelKey="notes" value={data.notes} wide />
        ) : null}
        {blank ? <Field labelKey="gateOfficer" blank /> : null}
        {blank ? <Field labelKey="remarks" blank wide /> : null}
      </div>

      <footer className="gpc-foot">
        {settings.showSignature ? (
          <div className="gpc-sign">
            <BilingualLabel labelKey="signature" />
            <span className="gpc-line" />
          </div>
        ) : null}
        {settings.showStamp ? (
          <div className="gpc-stamp">
            <BilingualLabel labelKey="stamp" />
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
            <BilingualLabel labelKey="verification" />
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
