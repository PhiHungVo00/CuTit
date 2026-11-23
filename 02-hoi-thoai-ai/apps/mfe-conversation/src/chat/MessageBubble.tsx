/**
 * Bong bóng tin nhắn kiểu Messenger (người học bên phải, Cu Tít bên trái, tin chưa gửi được có nút gửi lại).
 * Mẫu bố cục tham khảo ý tưởng của @chatscope/chat-ui-kit-react (MIT) — chỉ học cách chia nhóm, KHÔNG chép mã.
 */
import { memo } from 'react';
import { Button, CuTit, Icon } from '@vietlearning/ui';
import { SlowListen, say as sayAt } from '../listen';
import { AgentBlockView } from './AgentBlockView';
import type { ChatMessage } from './useChatSession';
import { useT } from '../i18n';

const BASE = 0.95;

export const MessageBubble = memo(function MessageBubble({ message: m, tutorName, avatar, onResend }: { message: ChatMessage; tutorName: string; avatar: boolean; onResend: (id: string) => void }) {
  const t = useT();
  if (m.role === 'user') {
    const failed = m.status === 'failed';
    return (
      <div className="flex max-w-[85%] flex-col gap-1 self-end" data-status={failed ? 'failed' : 'sent'}>
        {m.image && <img src={m.image.previewUrl} alt={t('imageSent')} className="max-h-48 max-w-full self-end rounded-2xl rounded-br-md border border-line object-cover" />}
        <p lang="vi" className={`m-0 rounded-2xl rounded-br-md px-3 py-2 text-[16px] ${failed ? 'border border-danger-ink bg-danger-soft text-danger-ink' : 'bg-accent text-accent-ink'}`}>
          {m.text}
        </p>
        {failed && (
          <div role="alert" className="flex flex-wrap items-center justify-end gap-2 text-sm text-danger-ink">
            <span>
              <strong>{t('notSent')}</strong>
              {m.errorText ? ` · ${m.errorText}` : ''}
            </span>
            {m.canRetry && (
              <Button variant="secondary" onClick={() => onResend(m.id)}>
                {t('resend')}
              </Button>
            )}
          </div>
        )}
        {m.correction && (
          <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            <p className="m-0 text-ink">
              {t('shouldWrite')} <strong lang="vi">{m.correction.corrected}</strong>
            </p>
            <p className="m-0 text-ink-muted">{m.correction.explanation}</p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex max-w-[90%] items-start gap-2 self-start">
      {avatar && <CuTit mood="chan-dung" size={36} />}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="rounded-2xl rounded-bl-md border border-line-strong bg-surface px-3 py-2">
          <p className="m-0 text-xs font-bold text-ink-muted">
            {tutorName}
            {m.mock && t('mockLabel')}
          </p>
          <p lang="vi" className="m-0 whitespace-pre-wrap text-[16px] text-ink">
            {m.text || (m.pending ? '…' : '')}
          </p>
        </div>
        {!m.pending && m.text && (
          <div className="flex gap-2 self-start">
            <Button variant="secondary" onClick={() => void sayAt(m.text, BASE)}>
              <Icon name="loa" size={18} />
              {t('listen')}
            </Button>
            <SlowListen text={m.text} base={BASE} className="min-h-11 min-w-11 rounded-xl border border-line bg-surface-2 px-3 text-base" />
          </div>
        )}
        {m.blocks?.map((b) => <AgentBlockView key={b.id} block={b} />)}
      </div>
    </div>
  );
});
