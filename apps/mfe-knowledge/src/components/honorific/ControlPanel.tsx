import { memo } from 'react';
import type { RelationCategory } from '@vietlearning/content';
import { ChoiceGroup } from './ChoiceGroup';
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

const relationChoices = RELATIONS.map((r) => ({
  id: r.id,
  label: (
    <>
      <span aria-hidden="true">{r.icon}</span>
      <span>{r.label}</span>
    </>
  )
}));
const ageChoices = AGE_STEPS.map((a) => ({ id: a.step, label: a.title }));
const contextChoices = CONTEXT_STEPS.map((c) => ({ id: c.step, label: c.title }));

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
  return (
    <section
      aria-labelledby="ct-controls-title"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <h2 id="ct-controls-title" className="flex items-center gap-2 text-lg font-extrabold text-ink">
        <span aria-hidden="true">🎛️</span> Chọn ngữ cảnh
      </h2>

      <ChoiceGroup label="1. Mối quan hệ" value={p.relation} options={relationChoices} onChange={p.setRelation} columns={2} size="sm" />

      <ChoiceGroup
        label="2. Chênh lệch tuổi"
        value={p.ageStep}
        options={ageChoices}
        onChange={p.setAgeStep}
        columns={2}
        hint={AGE_STEPS[p.ageStep].desc}
      />

      <ChoiceGroup
        label="3. Bối cảnh"
        value={p.contextStep}
        options={contextChoices}
        onChange={p.setContextStep}
        hint={CONTEXT_STEPS[p.contextStep].desc}
      />

      <div className="flex flex-col gap-4 border-t border-dashed border-line pt-4">
        <ChoiceGroup
          label={`Tôi (${p.isReversed ? 'người nghe' : 'người nói'})`}
          value={p.userGender}
          options={USER_GENDERS}
          onChange={p.setUserGender}
        />
        <ChoiceGroup
          label={`Đối phương (${p.isReversed ? 'người nói' : 'người nghe'})`}
          value={p.partnerGender}
          options={PARTNER_GENDERS}
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
          {p.isReversed ? 'Đối phương đang nói với tôi' : 'Tôi đang nói với đối phương'}
        </button>
      </div>
    </section>
  );
});
