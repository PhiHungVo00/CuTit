import { memo } from 'react';
import { CuTit } from '@vietlearning/ui';
import { useT } from '../i18n';

export interface CuTitWisdomCardProps {
  wisdom: string;
  explanation: string;
  relationName: string;
}

/** Thẻ "Bé Cu Tít mách nước": ca dao/tục ngữ + giải thích văn hóa. Màu lấy từ design tokens. */
export const CuTitWisdomCard = memo(function CuTitWisdomCard({ wisdom, explanation, relationName }: CuTitWisdomCardProps) {
  const t = useT();
  return (
    <section
      aria-labelledby="ct-wisdom-title"
      className="[contain-intrinsic-size:auto_520px] [content-visibility:auto] flex flex-col gap-4 rounded-2xl border border-line-strong bg-surface-2 p-4 shadow-card"
    >
      <div className="flex items-center gap-3">
        <CuTit mood="chan-dung" size={56} />
        <div>
          <h2 id="ct-wisdom-title" className="m-0 text-base font-extrabold text-ink">
            {t('wisdomTitle')}
          </h2>
          <p className="m-0 text-sm text-ink-soft">
            {t('rule')} <strong className="text-heading">{relationName}</strong>
          </p>
        </div>
      </div>

      <blockquote className="m-0 flex gap-3 rounded-xl border border-line bg-sunken p-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-heading">{t('oldSaying')}</div>
          <p className="m-0 text-[15px] font-semibold italic leading-relaxed text-ink">“{wisdom}”</p>
        </div>
      </blockquote>

      <p className="m-0 rounded-xl bg-surface p-3 text-[15px] leading-relaxed text-ink-soft">
        <strong className="text-ink">{t('meaning')}</strong>
        {explanation}
      </p>
    </section>
  );
});
