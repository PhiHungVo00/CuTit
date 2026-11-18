import { DIALECT_DICTIONARY, type Dialect } from '@vietlearning/content';
import { playText } from '@vietlearning/exercises';
import { useLearner } from '@vietlearning/state';
import { useT } from './i18n';

const REGIONS: Dialect[] = ['north', 'central', 'south'];

/**
 * Thẻ “miền khác nói thế nào” của một unit (GĐ2, A7): mỗi mục Bắc / Trung / Nam, bấm để nghe theo giọng miền đó
 * (tệp dựng sẵn nếu có, không thì TTS của máy). Miền người học đã chọn được tô đậm.
 */
export default function DialectCard({ ids }: { ids: readonly string[] }) {
  const t = useT();
  const mine = useLearner((s) => s.preferences.dialect);
  const entries = ids.map((id) => DIALECT_DICTIONARY.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
  return (
    <table className="w-full table-fixed border-collapse text-sm" lang="vi">
      <caption className="sr-only">{t('dialectCard')}</caption>
      <thead>
        <tr>
          {REGIONS.map((r) => (
            <th key={r} scope="col" className={['p-1 text-left text-xs uppercase tracking-wide', r === mine ? 'text-heading' : 'text-ink-muted'].join(' ')}>
              {t(`region.${r}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id} className="border-t border-line">
            {REGIONS.map((r) => (
              <td key={r} className="p-0.5">
                <button
                  type="button"
                  onClick={() => void playText(e[r], r)}
                  aria-label={t('dialectPlay', { word: e[r], region: t(`region.${r}`) })}
                  className={['min-h-11 w-full rounded-lg px-1 text-left', r === mine ? 'font-extrabold text-heading' : 'text-ink'].join(' ')}
                >
                  🔈 {e[r]}
                </button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
