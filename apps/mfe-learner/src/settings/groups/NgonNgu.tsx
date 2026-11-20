import { useLearner, type UiLanguage } from '@vietlearning/state';
import { ChoiceGroup, card } from '../../common/ui';
import { useT as useLearnerT } from '../../i18n';
import { SyncLine } from '../parts';
import { usePrefsUpdate } from '../usePrefs';

const UI_LANGS: { value: UiLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' }
];

export function NgonNgu() {
  const t = useLearnerT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const { sync, update } = usePrefsUpdate();
  return (
    <>
      <SyncLine sync={sync} />
      <section className={card}>
        <ChoiceGroup name="uilang" legend={t('uiLangLegend')} value={lang} options={UI_LANGS} onChange={(uiLanguage) => update({ uiLanguage })} />
      </section>
    </>
  );
}
