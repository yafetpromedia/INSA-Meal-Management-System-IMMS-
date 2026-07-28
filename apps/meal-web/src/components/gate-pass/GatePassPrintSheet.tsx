'use client';

import { GatePassCard } from '@/components/gate-pass/GatePassCard';
import {
  blankCard,
  chunkCards,
  padPageSlots,
  type GatePassCardData,
  type GatePassLayout,
  type GatePassTemplateSettings,
} from '@/lib/gate-pass-print';

type Props = {
  cards: GatePassCardData[];
  layout: GatePassLayout;
  settings: GatePassTemplateSettings;
  /** When true, empty slots on last page stay blank for handwriting */
  fillBlanks?: boolean;
};

export function GatePassPrintSheet({
  cards,
  layout,
  settings,
  fillBlanks = false,
}: Props) {
  const pages = chunkCards(cards, layout).map((page, pageIndex) => {
    const slots = fillBlanks
      ? padPageSlots(page, layout, (i) => blankCard(pageIndex * layout + i + 1))
      : page.length
        ? page
        : Array.from({ length: layout }, (_, i) => blankCard(i + 1));
    return slots;
  });

  return (
    <div className={`gp-print-root layout-${layout}`} id="gate-pass-print-root">
      {pages.map((slots, pageIdx) => (
        <section
          key={`page-${pageIdx}`}
          className={`gp-a4-page layout-${layout}`}
          aria-label={`Gate pass page ${pageIdx + 1}`}
        >
          <div className={`gp-card-grid layout-${layout}`}>
            {slots.map((card, i) => (
              <div key={`${pageIdx}-${i}-${card.leaveNumber || 'blank'}`} className="gp-card-cell">
                <GatePassCard
                  data={card}
                  settings={settings}
                  slot={pageIdx * layout + i + 1}
                />
              </div>
            ))}
          </div>
          <div className="gp-cut-guides" aria-hidden>
            <span className="gp-cut-h" />
            <span className="gp-cut-h" />
            <span className="gp-cut-v" />
            <span className="gp-cut-v" />
            <span className="gp-cut-v" />
          </div>
        </section>
      ))}
    </div>
  );
}
