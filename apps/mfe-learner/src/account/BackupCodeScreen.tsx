import { useEffect, useRef, useState } from 'react';
import { CuTit } from '@vietlearning/ui';
import { card, primaryBtn, secondaryBtn } from '../common/ui';
import { useT } from './i18n';

/**
 * Mã dự phòng (hiện MỘT lần, không lưu trên máy). Nút tiếp tục chỉ bật sau khi tick "Tôi đã lưu mã".
 * `fresh` = mã MỚI sau khi đặt lại mật khẩu/tạo mã mới (mã cũ hết hiệu lực); mặc định = ngay sau khi tạo tài khoản.
 */
export function BackupCodeScreen({ code, fresh, onContinue }: { code: string; fresh?: boolean; onContinue: () => void }) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* trình duyệt chặn clipboard: người dùng vẫn chép tay được */
    }
  };

  return (
    <section className={card} aria-labelledby="ct-backup-h">
      <div className="flex items-center gap-3">
        <CuTit mood="khen" size={72} alt="" />
        <h2 id="ct-backup-h" ref={head} tabIndex={-1} className="m-0 text-xl font-extrabold text-heading">
          {fresh ? t('backupNewTitle') : t('backupTitle')}
        </h2>
      </div>
      <p className="m-0 text-[15px] text-ink-soft">{fresh ? t('backupNewBody') : t('backupBody')}</p>
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-bold text-ink-soft">{t('backupLabel')}</span>
        <output data-testid="backup-code" className="select-all rounded-xl bg-surface-2 p-3 text-center font-mono text-xl font-extrabold tracking-wider text-ink">
          {code}
        </output>
        <button type="button" className={secondaryBtn} onClick={() => void copy()}>
          {copied ? t('backupCopied') : t('backupCopy')}
        </button>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-surface-2 px-3 py-2 font-bold text-ink">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
        {t('backupSaved')}
      </label>
      <button type="button" className={primaryBtn} disabled={!saved} onClick={onContinue}>
        {t('backupContinue')}
      </button>
    </section>
  );
}
