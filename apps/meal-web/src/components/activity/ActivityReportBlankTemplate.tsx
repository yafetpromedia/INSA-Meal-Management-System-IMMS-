/** Blank IMMS activity report form — Word (.doc) download + on-screen print layout. */

const SECTIONS = [
  'Objectives',
  'Description',
  'Activities performed',
  'Outcomes',
  'Challenges',
  'Recommendations',
] as const;

function writingLines(count: number) {
  return Array.from({ length: count }, () => '<div class="line">&nbsp;</div>').join('');
}

function fieldRow(label: string) {
  return `<tr>
    <td class="lbl">${label}</td>
    <td class="val"><div class="uline">&nbsp;</div></td>
  </tr>`;
}

/** Microsoft Word–compatible blank form (.doc). Open in Word to type, or print and write by hand. */
export function downloadBlankActivityWordTemplate() {
  const sectionBlocks = SECTIONS.map(
    (title) => `
    <h2>${title}</h2>
    ${writingLines(title === 'Description' || title === 'Activities performed' ? 6 : 4)}
  `,
  ).join('');

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>IMMS Campus Activity Report — Blank Template</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page { size: A4; margin: 1.8cm 1.6cm; }
  body {
    font-family: Calibri, Arial, sans-serif;
    color: #111;
    font-size: 11pt;
    line-height: 1.35;
  }
  .mast {
    border-bottom: 2px solid #111;
    padding-bottom: 8pt;
    margin-bottom: 14pt;
  }
  .org { font-size: 9pt; letter-spacing: 0.08em; text-transform: uppercase; color: #444; margin: 0; }
  .kind { font-size: 16pt; font-weight: bold; margin: 2pt 0 0; }
  .hint { font-size: 9pt; color: #555; margin: 6pt 0 0; }
  h1 { font-size: 13pt; margin: 0 0 10pt; }
  h2 {
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #333;
    border-bottom: 1px solid #ccc;
    padding-bottom: 2pt;
    margin: 14pt 0 6pt;
  }
  table.meta { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
  table.meta td { padding: 5pt 4pt; vertical-align: bottom; }
  td.lbl { width: 28%; font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
  td.val { width: 72%; }
  .uline {
    border-bottom: 1px solid #222;
    min-height: 16pt;
    width: 100%;
  }
  .line {
    border-bottom: 1px solid #bbb;
    height: 18pt;
    margin: 0;
  }
  .sig {
    margin-top: 22pt;
    width: 100%;
    border-collapse: collapse;
  }
  .sig td { width: 48%; padding-top: 28pt; font-size: 9pt; color: #444; }
  .sig .uline { margin-top: 4pt; }
  .foot {
    margin-top: 18pt;
    padding-top: 6pt;
    border-top: 1px solid #ccc;
    font-size: 8pt;
    color: #666;
  }
</style>
</head>
<body>
  <div class="mast">
    <p class="org">IMMS · Camp Management</p>
    <p class="kind">Campus Activity Report</p>
    <p class="hint">Blank official template — type in Word, or print and write by hand.</p>
  </div>

  <h1>Report cover</h1>
  <table class="meta">
    ${fieldRow('Title')}
    ${fieldRow('Report number (if any)')}
    ${fieldRow('Category')}
    ${fieldRow('Campus')}
    ${fieldRow('Program')}
    ${fieldRow('Academic year')}
    ${fieldRow('Date')}
    ${fieldRow('Start – end time')}
    ${fieldRow('Venue / location')}
    ${fieldRow('Participant count')}
    ${fieldRow('Reported by')}
  </table>

  ${sectionBlocks}

  <h2>People tagged / attendees (optional)</h2>
  ${writingLines(3)}

  <table class="sig">
    <tr>
      <td>
        Prepared by
        <div class="uline">&nbsp;</div>
        Name &amp; signature · date
      </td>
      <td>
        Reviewed / approved by
        <div class="uline">&nbsp;</div>
        Name &amp; signature · date
      </td>
    </tr>
  </table>

  <p class="foot">IMMS · Activity archive template · Fill digitally in Word or by hand after printing</p>
</body>
</html>`;

  const blob = new Blob(['\ufeff' + html], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'IMMS-Campus-Activity-Report-Template.doc';
  a.click();
  URL.revokeObjectURL(url);
}

/** On-screen blank form for Print → Save as PDF or handwritten fill. */
export function ActivityReportBlankForm() {
  return (
    <article className="art-blank" id="activity-blank-template">
      <header className="art-blank-mast">
        <div>
          <p className="art-doc-org">IMMS · Camp Management</p>
          <p className="art-doc-kind">Campus Activity Report</p>
          <p className="art-blank-hint">Blank template — print and write by hand, or save as PDF.</p>
        </div>
        <strong className="art-blank-badge">Official form</strong>
      </header>

      <h1 className="art-blank-h">Report cover</h1>
      <div className="art-blank-fields">
        {[
          'Title',
          'Report number (if any)',
          'Category',
          'Campus',
          'Program',
          'Academic year',
          'Date',
          'Start – end time',
          'Venue / location',
          'Participant count',
          'Reported by',
        ].map((label) => (
          <div key={label} className="art-blank-field">
            <span>{label}</span>
            <div className="art-blank-uline" />
          </div>
        ))}
      </div>

      {SECTIONS.map((title) => (
        <section key={title} className="art-blank-section">
          <h2>{title}</h2>
          <div className="art-blank-lines" aria-hidden>
            {Array.from({ length: title === 'Description' || title === 'Activities performed' ? 6 : 4 }).map(
              (_, i) => (
                <div key={i} className="art-blank-line" />
              ),
            )}
          </div>
        </section>
      ))}

      <section className="art-blank-section">
        <h2>People tagged / attendees (optional)</h2>
        <div className="art-blank-lines" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="art-blank-line" />
          ))}
        </div>
      </section>

      <div className="art-blank-sigs">
        <div>
          <span>Prepared by</span>
          <div className="art-blank-uline" />
          <small>Name & signature · date</small>
        </div>
        <div>
          <span>Reviewed / approved by</span>
          <div className="art-blank-uline" />
          <small>Name & signature · date</small>
        </div>
      </div>

      <footer className="art-doc-foot">
        <span>IMMS · Activity archive template</span>
        <span>Fill by hand or digitally</span>
      </footer>
    </article>
  );
}
