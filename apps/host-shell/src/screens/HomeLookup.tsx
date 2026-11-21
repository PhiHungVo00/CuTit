import { ListRow } from '@vietlearning/ui';
import { defineMessages } from '@vietlearning/state';
import { prefetchPath } from '../routes';
import { useTransitionNavigate } from '../shell/useTransitionNavigate';

const { useT } = defineMessages(
  { lookup: 'Tra cứu', xungHo: 'Ma trận xưng hô', vanHoa: 'Cẩm nang văn hóa', phuongNgu: 'Phương ngữ 3 miền' },
  { lookup: 'Look up', xungHo: 'Pronoun matrix', vanHoa: 'Culture guide', phuongNgu: 'Dialects of 3 regions' }
);

const LOOKUPS = [
  { path: '/xung-ho', key: 'xungHo' },
  { path: '/van-hoa', key: 'vanHoa' },
  { path: '/phuong-ngu', key: 'phuongNgu' }
] as const;

/** Lối vào tra cứu ở cuối tab Học: xưng hô, văn hóa, phương ngữ. Chunk lười. */
export default function HomeLookup() {
  const t = useT();
  const go = useTransitionNavigate();
  return (
    <>
      <h2 className="lookup-title">{t('lookup')}</h2>
      <div className="list-card">
        {LOOKUPS.map(({ path, key }) => (
          <div key={path} onPointerDown={() => prefetchPath(path)}>
            <ListRow
              icon="hoc"
              label={t(key)}
              to={path}
              onClick={(e) => {
                e.preventDefault();
                go(path);
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
