import { memo } from 'react';
import type { RelationCategory } from '@vietlearning/content';
import { ChoiceGroup } from './ChoiceGroup';
import { useT } from '../../i18n';
import {
  AGE_STEPS,
  CONTEXT_STEPS,
  PARTNER_GENDERS,
  RELATIONS,
  USER_GENDERS,
  type AgeStep,
  type ContextStep,
  type Gender,
  type PartnerGender
} from './options';


interface ControlPanelProps {
  relation: RelationCategory;
  ageStep: AgeStep;
  contextStep: ContextStep;
  userGender: Gender;
  partnerGender: PartnerGender;
  isReversed: boolean;
  setRelation: (v: RelationCategory) => void;
  setAgeStep: (v: AgeStep) => void;
  setContextStep: (v: ContextStep) => void;
  setUserGender: (v: Gender) => void;
  setPartnerGender: (v: PartnerGender) => void;
  toggleReversed: () => void;
}

/** Bàn điều khiển ngữ cảnh xưng hô: quan hệ, tuổi, bối cảnh, giới tính, chiều nói. */
export const ControlPanel = memo(function ControlPanel(p: ControlPanelProps) {
  const t = useT();
  const relationChoices = RELATIONS.map((r) => ({
    id: r.id,
    label: (
      <>
        <span aria-hidden="true">{r.icon}</span>
        <span>{t(`relation.${r.id}`)}</span>
      </>
    )
  }));
  const ageChoices = AGE_STEPS.map((a) => ({ id: a, label: t(`age.${a}`) }));
  const contextChoices = CONTEXT_STEPS.map((c) => ({ id: c, label: t(`context.${c}`) }));
  const userGenders = USER_GENDERS.map((g) => ({ id: g, label: t(`gender.${g}`) }));
  const partnerGenders = PARTNER_GENDERS.map((g) => ({ id: g, label: t(`gender.${g}`) }));
  return (
    <section
      aria-labelledby="ct-controls-title"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <h2 id="ct-controls-title" className="flex items-center gap-2 text-lg font-extrabold text-ink">
        <span aria-hidden="true">🎛️</span> {t('controls')}
      </h2>

      <ChoiceGroup label={t('relationLabel')} value={p.relation} options={relationChoices} onChange={p.setRelation} columns={2} size="sm" align="start" />

      <ChoiceGroup
        label={t('ageLabel')}
        value={p.ageStep}
        options={ageChoices}
        onChange={p.setAgeStep}
        columns={2}
        hint={t(`age.${p.ageStep}.desc`)}
      />

      <ChoiceGroup
        label={t('contextLabel')}
        value={p.contextStep}
        options={contextChoices}
        onChange={p.setContextStep}
        hint={t(`context.${p.contextStep}.desc`)}
      />

      <div className="flex flex-col gap-4 border-t border-dashed border-line pt-4">
        <ChoiceGroup
          label={t('me', { role: p.isReversed ? t('listener') : t('speaker') })}
          value={p.userGender}
          options={userGenders}
          onChange={p.setUserGender}
        />
        <ChoiceGroup
          label={t('them', { role: p.isReversed ? t('speaker') : t('listener') })}
          value={p.partnerGender}
          options={partnerGenders}
          onChange={p.setPartnerGender}
        />

        <button
          type="button"
          aria-pressed={p.isReversed}
          onClick={p.toggleReversed}
          className={[
            'flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-bold transition-colors',
            p.isReversed ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface-2 text-ink'
          ].join(' ')}
        >
          <span aria-hidden="true">🔄</span>
          {p.isReversed ? t('theyTalk') : t('iTalk')}
        </button>
      </div>
    </section>
  );
});
