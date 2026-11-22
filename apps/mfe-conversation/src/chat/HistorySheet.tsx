import { useState } from 'react';
import { ROLEPLAY_SCENARIOS } from '@vietlearning/content';
import { Button, Icon } from '@vietlearning/ui';
import { useLearner } from '@vietlearning/state';
import { useT } from '../i18n';
import { CloseIcon } from './icons';

/** Phần của ChatConversation mà màn này dùng (kho thật ở `@vietlearning/state/chat-history`, import lười) */
export interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
  scenarioId?: string;
}

/** Danh sách cuộc trò chuyện đã lưu: mới nhất trước, mở lại, xóa từng cuộc, xóa tất cả (có xác nhận). */
export function HistorySheet({ conversations, onOpen, onNew, onDelete, onDeleteAll, onClose }: { conversations: ConversationRow[]; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; onDeleteAll: () => void; onClose: () => void }) {
  const t = useT();
  const en = useLearner((s) => s.preferences.uiLanguage) === 'en';
  const [confirming, setConfirming] = useState(false);
  const scenarioName = (id: string) => {
    const s = ROLEPLAY_SCENARIOS.find((x) => x.id === id);
    return s ? (en ? s.titleEn : s.title) : id;
  };
  const label = (c: ConversationRow) => (c.scenarioId ? t('practiceScenario', { name: scenarioName(c.scenarioId) }) : c.title || t('untitledChat'));
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ct-history-title" className="fixed inset-0 z-30 flex flex-col bg-canvas px-4 pb-6 pt-[calc(16px+env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex items-center gap-2">
          <h2 id="ct-history-title" className="m-0 flex-1 text-[22px] font-black text-heading">
            {t('historyTitle')}
          </h2>
          <button type="button" className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface" aria-label={t('historyClose')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <Button onClick={onNew}>
          <Icon name="chat" size={18} />
          {t('newChat')}
        </Button>
        <p className="m-0 text-xs text-ink-muted">{t('historyLocalOnly')}</p>
        {conversations.length === 0 ? (
          <p className="m-0 text-[15px] text-ink-soft">{t('historyEmpty')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {conversations.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-1">
                <button type="button" className="min-h-12 min-w-0 flex-1 truncate rounded-lg bg-transparent px-2 text-left text-[16px] font-bold text-ink" onClick={() => onOpen(c.id)}>
                  {label(c)}
                </button>
                <button type="button" className="flex size-11 items-center justify-center rounded-lg bg-transparent text-ink-muted" aria-label={`${t('deleteChat')}: ${label(c)}`} onClick={() => onDelete(c.id)}>
                  <Icon name="thung-rac" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {conversations.length > 0 &&
          (confirming ? (
            <div role="alertdialog" aria-label={t('deleteAllChats')} className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
              <p className="m-0 text-[15px]">{t('confirmDeleteAll')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  {t('confirmNo')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(false);
                    onDeleteAll();
                  }}
                >
                  {t('confirmYes')}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t('deleteAllChats')}
            </Button>
          ))}
      </div>
    </div>
  );
}
