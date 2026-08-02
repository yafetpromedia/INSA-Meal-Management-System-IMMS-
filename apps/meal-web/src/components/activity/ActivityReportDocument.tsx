'use client';

import { BrandLogo } from '@/components/BrandLogo';
import { StatusChip } from '@/components/ui/Badge';
import {
  activityStatusLabel,
  activityStatusTone,
  formatActivityDate,
  type ActivityReport,
} from '@/lib/activity';

type Props = {
  report: ActivityReport;
  /** Extra blocks (media gallery, actions) rendered under the narrative */
  children?: React.ReactNode;
  className?: string;
};

const SECTIONS = [
  ['Objectives', 'objectives'],
  ['Description', 'description'],
  ['Activities performed', 'activitiesPerformed'],
  ['Outcomes', 'outcomes'],
  ['Challenges', 'challenges'],
  ['Recommendations', 'recommendations'],
] as const;

/** Modern official-looking activity report document (screen + print). */
export function ActivityReportDocument({ report, children, className }: Props) {
  return (
    <article className={`art-doc ${className ?? ''}`} id="activity-report-document">
      <header className="art-doc-masthead">
        <div className="art-doc-brand">
          <BrandLogo variant="mark" size={40} className="art-doc-logo" alt="IMMS" />
          <div>
            <p className="art-doc-org">IMMS · Camp Management</p>
            <p className="art-doc-kind">Campus Activity Report</p>
          </div>
        </div>
        <div className="art-doc-ids">
          <strong>{report.reportNumber}</strong>
          <StatusChip tone={activityStatusTone(report.status)}>
            {activityStatusLabel(report.status)}
          </StatusChip>
        </div>
      </header>

      <h1 className="art-doc-title">{report.title}</h1>

      <div className="art-doc-meta">
        <div>
          <span>Category</span>
          <strong>{report.category?.name ?? '—'}</strong>
        </div>
        <div>
          <span>Campus</span>
          <strong>{report.campus?.shortName ?? report.campus?.name ?? '—'}</strong>
        </div>
        <div>
          <span>Program</span>
          <strong>{report.program?.name ?? '—'}</strong>
        </div>
        <div>
          <span>Academic year</span>
          <strong>{report.academicYear?.name ?? '—'}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>
            {formatActivityDate(report.reportDate)}
            {report.startTime ? ` · ${report.startTime}` : ''}
            {report.endTime ? `–${report.endTime}` : ''}
          </strong>
        </div>
        <div>
          <span>Venue</span>
          <strong>{report.location || '—'}</strong>
        </div>
        <div>
          <span>Participants</span>
          <strong>{report.participantCount}</strong>
        </div>
        <div>
          <span>Reported by</span>
          <strong>{report.submittedBy?.fullName ?? '—'}</strong>
        </div>
      </div>

      <div className="art-doc-body">
        {SECTIONS.map(([label, key]) => {
          const value = report[key];
          if (!value) return null;
          return (
            <section key={key} className="art-doc-section">
              <h2>{label}</h2>
              <p>{value}</p>
            </section>
          );
        })}

        {report.reviewNotes ? (
          <section className="art-doc-section">
            <h2>Review notes</h2>
            <p>{report.reviewNotes}</p>
          </section>
        ) : null}

        {report.participants?.length ? (
          <section className="art-doc-section">
            <h2>Tagged students</h2>
            <ul className="art-doc-people">
              {report.participants.map((p) => (
                <li key={p.id}>
                  {p.student?.fullName}
                  {p.student?.studentId ? ` (${p.student.studentId})` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {children ? <div className="art-doc-extra">{children}</div> : null}

      <footer className="art-doc-foot">
        <span>
          Reviewed by {report.reviewedBy?.fullName ?? '—'}
          {report.approvedAt ? ` · Approved ${formatActivityDate(report.approvedAt)}` : ''}
        </span>
        <span>IMMS Activity Archive</span>
      </footer>
    </article>
  );
}

/** Build a downloadable HTML file for a report (open/print → PDF). */
export function downloadActivityReportHtml(report: ActivityReport) {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const sections = SECTIONS.map(([label, key]) => {
    const value = report[key];
    if (!value) return '';
    return `<section><h2>${esc(label)}</h2><p>${esc(value).replace(/\n/g, '<br/>')}</p></section>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(report.reportNumber)} — ${esc(report.title)}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;color:#111;max-width:720px;margin:32px auto;padding:0 20px;line-height:1.5}
  h1{font-size:1.6rem;margin:8px 0 16px}
  h2{font-size:0.95rem;margin:20px 0 6px;letter-spacing:0.04em;text-transform:uppercase;color:#444}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;padding:14px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-size:0.9rem}
  .meta span{display:block;font-size:0.72rem;color:#666;text-transform:uppercase;letter-spacing:0.04em}
  .head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  .muted{color:#666;font-size:0.85rem}
  footer{margin-top:28px;padding-top:12px;border-top:1px solid #ddd;font-size:0.8rem;color:#555;display:flex;justify-content:space-between}
  @media print{body{margin:0}}
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="muted">IMMS · Campus Activity Report</div>
      <strong>${esc(report.reportNumber)}</strong>
    </div>
    <div class="muted">${esc(activityStatusLabel(report.status))}</div>
  </div>
  <h1>${esc(report.title)}</h1>
  <div class="meta">
    <div><span>Category</span><strong>${esc(report.category?.name ?? '—')}</strong></div>
    <div><span>Campus</span><strong>${esc(report.campus?.shortName ?? report.campus?.name ?? '—')}</strong></div>
    <div><span>Date</span><strong>${esc(formatActivityDate(report.reportDate))}</strong></div>
    <div><span>Venue</span><strong>${esc(report.location || '—')}</strong></div>
    <div><span>Participants</span><strong>${report.participantCount}</strong></div>
    <div><span>Reported by</span><strong>${esc(report.submittedBy?.fullName ?? '—')}</strong></div>
  </div>
  ${sections}
  <footer>
    <span>Reviewed by ${esc(report.reviewedBy?.fullName ?? '—')}</span>
    <span>IMMS Activity Archive</span>
  </footer>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.reportNumber || 'activity-report'}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
