import { useNavigate } from 'react-router-dom';
import { CuTit } from '@vietlearning/ui';
import type { Remaining } from '@vietlearning/contracts/api';
import { Icon } from '@vietlearning/ui';
import { useT } from '../i18n';
import { HistoryIcon, VideoIcon } from './icons';

const btn = 'flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-ink disabled:opacity-40';

/** Đầu màn chat kiểu Messenger: Cu Tít, số lượt còn lại, lịch sử, gọi thường, gọi video. */
export function ChatHeader({
  remaining,
  tutorName,
  onHistory,
  ensureConsent
}: {
  remaining?: Remaining;
  tutorName: string;
  onHistory: () => void;
  /** hỏi đồng ý AI trước khi dùng micro/camera; false = người học để sau */
  ensureConsent: (cap: 'voice' | 'camera') => Promise<boolean>;
}) {
  const t = useT();
  const navigate = useNavigate();
  const low = remaining !== undefined && remaining.turns <= 5;
  const noVideo = remaining !== undefined && remaining.visionImages === 0;
  const call = async (video: 0 | 1) => {
    if (!(await ensureConsent(video ? 'camera' : 'voice'))) return;
    navigate(`/goi-thoai?video=${video}`);
  };
  return (
    <header className="sticky top-0 z-10 flex flex-col gap-1 border-b-2 border-line bg-canvas pb-2">
      <div className="flex items-center gap-2">
        <CuTit mood="chan-dung" size={40} alt="" />
        <h1 className="m-0 min-w-0 flex-1 truncate text-[20px] font-black leading-tight text-heading">{tutorName}</h1>
        <button type="button" className={btn} aria-label={t('openHistory')} title={t('openHistory')} onClick={onHistory}>
          <HistoryIcon />
        </button>
        <button type="button" className={btn} aria-label={t('voiceCall')} title={t('voiceCall')} onClick={() => void call(0)}>
          <Icon name="goi" size={22} />
        </button>
        <button type="button" className={btn} aria-label={t('videoCall')} title={t('videoCall')} disabled={noVideo} onClick={() => void call(1)}>
          <VideoIcon />
        </button>
      </div>
      {remaining && (
        <p data-testid="remaining" className={`m-0 text-sm ${low ? 'ct-remaining-low font-bold text-danger-ink' : 'text-ink-muted'}`}>
          {t('remainingToday', { n: remaining.turns })}
        </p>
      )}
      {noVideo && <p className="m-0 text-xs text-ink-muted">{t('noPhotoLeft')}</p>}
    </header>
  );
}
