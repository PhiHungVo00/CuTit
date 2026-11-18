import { useState } from 'react';
import type { ExplainRequest, ExplainResponse } from '@vietlearning/contracts/api';
import { useLearner } from '@vietlearning/state';
import { useT } from '../i18n';

export type ExplainFn = (req: ExplainRequest) => Promise<ExplainResponse>;

/** POST /v1/practice/explain (tải api-client + contracts lúc bấm, không nằm trong chunk bài học) */
export const explainOnGateway: ExplainFn = async (req) => {
  const [{ request }, { ExplainResponseSchema }] = await Promise.all([import('@vietlearning/api-client'), import('@vietlearning/contracts/api')]);
  return request('/v1/practice/explain', { body: req, schema: ExplainResponseSchema });
};

/**
 * “Giải thích thêm 💡” sau câu sai (GĐ2): hỏi LLM qua Gateway, hiển thị CHỮ THUẦN (không render HTML từ LLM,
 * Nguyên tắc 6). Không dùng role="status" để không lẫn với phản hồi đúng/sai của bài.
 */
export function ExplainButton({ request, explain = explainOnGateway }: { request: Omit<ExplainRequest, 'language'>; explain?: ExplainFn }) {
  const t = useT();
  const language = useLearner((s) => s.preferences.uiLanguage);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | ExplainResponse>('idle');
  const ask = async () => {
    setState('loading');
    try {
      setState(await explain({ ...request, language }));
    } catch {
      setState('error');
    }
  };
  if (typeof state === 'object') {
    return (
      <div aria-live="polite" className="mt-2 rounded-lg bg-surface p-2 text-sm text-ink">
        <p className="m-0">{state.explanation}</p>
        {state.tip && <p className="m-0 mt-1 text-ink-soft">💡 {state.tip}</p>}
      </div>
    );
  }
  return (
    <div aria-live="polite">
      <button type="button" onClick={() => void ask()} disabled={state === 'loading'} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink disabled:opacity-60">
        {state === 'loading' ? t('explainLoading') : t('explainMore')}
      </button>
      {state === 'error' && <p className="m-0 mt-1 text-sm">{t('explainError')}</p>}
    </div>
  );
}
