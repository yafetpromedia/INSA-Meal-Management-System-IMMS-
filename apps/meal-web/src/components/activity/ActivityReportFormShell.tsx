'use client';

import { ReactNode } from 'react';
import { BrandLogo } from '@/components/BrandLogo';

type Props = {
  mode: 'create' | 'edit';
  title: string;
  subtitle?: string;
  reportNumber?: string;
  autoSaveNote?: string;
  children: ReactNode;
  footer: ReactNode;
};

/** Document-style shell for writing / editing an activity report. */
export function ActivityReportFormShell({
  mode,
  title,
  subtitle,
  reportNumber,
  autoSaveNote,
  children,
  footer,
}: Props) {
  return (
    <div className="art-form">
      <header className="art-form-masthead">
        <div className="art-form-brand">
          <BrandLogo variant="mark" size={36} className="art-doc-logo" alt="INSA" />
          <div>
            <p className="art-doc-org">INSA · Activity template</p>
            <p className="art-doc-kind">
              {mode === 'create' ? 'New campus day report' : 'Edit report draft'}
            </p>
          </div>
        </div>
        <div className="art-form-status">
          {reportNumber ? <strong>{reportNumber}</strong> : <span className="muted">Draft</span>}
          {autoSaveNote ? <span className="muted art-form-autosave">{autoSaveNote}</span> : null}
        </div>
      </header>

      <div className="art-form-intro">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>

      <div className="art-form-body">{children}</div>
      <div className="art-form-footer">{footer}</div>
    </div>
  );
}
