import { useEffect, useRef, useState } from 'react';
import type { AuthSession } from '@vietlearning/api-client/session';
import type { SyncEngine, SyncStatus } from '@vietlearning/state/sync';
import { learnerStore, useLearner } from '@vietlearning/state';
import { progressStore } from '@vietlearning/state/progress';
import { getLocalReminders } from '@vietlearning/native';
import { card, secondaryBtn } from '../common/ui';
import { useT } from '../i18n';

/** Phụ thuộc nạp lười (chunk riêng) — test tiêm bản giả */
export interface AccountDeps {
  session(): Promise<Pick<AuthSession, 'info' | 'getToken' | 'recover' | 'deleteAccount'>>;
  engine(): Promise<SyncEngine | null>;
}

const defaultDeps: AccountDeps = {
  session: () => import('@vietlearning/api-client/session').then((m) => m.getAuthSession()),
  engine: () => import('@vietlearning/state/sync').then((m) => m.getSyncEngine())
};

type Busy = null | 'create' | 'sync' | 'recover' | 'delete';
type Msg = { kind: 'ok' | 'error'; text: string } | null;

function errorText(err: unknown, t: ReturnType<typeof useT>, recovering = false): string {
  const e = err as { kind?: string; code?: string };
  if (e?.kind === 'offline' || e?.kind === 'timeout') return t('needNetwork');
  if (recovering && (e?.code === 'invalid_recovery_code' || e?.kind === 'unauthorized')) return t('recoverBad');
  return t('actionFailed');
}

/**
 * M12 — Tài khoản & sao lưu: mã khôi phục, trạng thái đồng bộ, khôi phục trên máy mới, xóa tài khoản thật.
 */
export function AccountSection({ deps = defaultDeps }: { deps?: AccountDeps }) {
  const t = useT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const [info, setInfo] = useState<{ userId: string; recoveryCode: string | null } | null | undefined>(undefined);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mounted = useRef(true);

  const refresh = async () => {
    const s = await deps.session();
    const i = await s.info();
    if (mounted.current) setInfo(i);
  };

  useEffect(() => {
    mounted.current = true;
    let off: (() => void) | undefined;
    void refresh();
    void deps.engine().then((e) => {
      if (!e || !mounted.current) return;
      setStatus(e.status());
      off = e.onStatus((s) => mounted.current && setStatus(s));
    });
    return () => {
      mounted.current = false;
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<Msg>, recovering = false) => {
    setBusy(kind);
    setMsg(null);
    try {
      const m = await fn();
      if (mounted.current) setMsg(m);
    } catch (err) {
      if (mounted.current) setMsg({ kind: 'error', text: errorText(err, t, recovering) });
    } finally {
      if (mounted.current) setBusy(null);
      await refresh().catch(() => undefined);
    }
  };

  const createNow = () =>
    run('create', async () => {
      await (await deps.session()).getToken();
      await refresh(); // hiện mã khôi phục ngay khi có tài khoản, không chờ đồng bộ xong
      await (await deps.engine())?.flush({ pull: true });
      return null;
    });

  const syncNow = () =>
    run('sync', async () => {
      const e = await deps.engine();
      if (e && !(await e.flush({ pull: true }))) return { kind: 'error', text: t('syncOffline') };
      return null;
    });

  const recover = () =>
    run(
      'recover',
      async () => {
        const [s, e] = await Promise.all([deps.session(), deps.engine()]);
        if (e) await e.pullAndReplace(() => s.recover(code));
        else await s.recover(code);
        setCode('');
        return { kind: 'ok', text: t('recoverOk', { n: Object.keys(learnerStore.getState().srs).length }) };
      },
      true
    );

  const remove = () =>
    run('delete', async () => {
      const [s, e] = await Promise.all([deps.session(), deps.engine()]);
      // Có hàng đợi: resetLocal xóa cả tiến độ lộ trình (khóa riêng becutit.progress) và hủy lịch nhắc (onLocalReset của Host)
      if (e) await e.resetLocal(() => s.deleteAccount());
      else {
        await s.deleteAccount();
        learnerStore.getState().reset();
        progressStore.getState().resetProgress();
        void getLocalReminders().cancelAll();
      }
      setConfirmDelete(false);
      return { kind: 'ok', text: t('deleted') };
    });

  const copy = async () => {
    if (!info?.recoveryCode) return;
    try {
      await navigator.clipboard.writeText(info.recoveryCode);
      setCopied(true);
      setTimeout(() => mounted.current && setCopied(false), 2000);
    } catch {
      /* trình duyệt chặn clipboard: người học vẫn chép tay được */
    }
  };

  const time = status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : null;
  const syncLine = !status
    ? null
    : status.syncing
      ? t('syncing')
      : status.error
        ? t('syncOffline')
        : status.pending
          ? t('syncPending', { n: status.pending })
          : time
            ? t('syncDone', { time })
            : t('syncNever');

  return (
    <>
      <section className={card} aria-labelledby="ct-account">
        <h2 id="ct-account" className="m-0 text-lg font-extrabold text-ink">
          {t('accountSection')}
        </h2>
        {info === null && (
          <>
            <p className="m-0 text-[15px] text-ink-soft">{t('accountNone')}</p>
            <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => void createNow()}>
              {t('accountCreate')}
            </button>
          </>
        )}
        {info && (
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-bold text-ink-soft">{t('recoveryLabel')}</span>
            {info.recoveryCode ? (
              <>
                <output data-testid="recovery-code" className="select-all rounded-xl bg-surface-2 p-3 text-center font-mono text-xl font-extrabold tracking-wider text-ink">
                  {info.recoveryCode}
                </output>
                <button type="button" className={secondaryBtn} onClick={() => void copy()}>
                  {copied ? t('copied') : t('copy')}
                </button>
                <p className="m-0 text-sm text-ink-muted">{t('recoveryHint')}</p>
              </>
            ) : (
              <p className="m-0 text-sm text-ink-muted">{t('recoveryUnknown')}</p>
            )}
          </div>
        )}
        {syncLine && (
          <p role="status" className="m-0 text-sm text-ink-muted">
            {syncLine}
          </p>
        )}
        {info && (
          <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => void syncNow()}>
            {busy === 'sync' ? t('syncing') : t('syncNow')}
          </button>
        )}

        <form
          className="flex flex-col gap-2 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void recover();
          }}
        >
          <h3 className="m-0 text-base font-extrabold text-ink">{t('recoverTitle')}</h3>
          <label className="flex flex-col gap-1 text-[15px] font-bold text-ink-soft">
            {t('recoverInput')}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              maxLength={40}
              className="min-h-12 rounded-xl border border-line-strong bg-surface px-3 font-mono text-base text-ink"
            />
          </label>
          <p className="m-0 text-sm text-ink-muted">{t('recoverWarn')}</p>
          <button type="submit" className={secondaryBtn} disabled={busy !== null || code.replace(/[\s-]/g, '').length < 16}>
            {busy === 'recover' ? t('recovering') : t('recoverBtn')}
          </button>
        </form>

        {msg && (
          <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`m-0 rounded-xl p-3 text-[15px] ${msg.kind === 'error' ? 'bg-danger-soft text-danger-ink' : 'bg-surface-2 text-ink'}`}>
            {msg.text}
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="ct-data">
        <h2 id="ct-data" className="m-0 text-lg font-extrabold text-ink">
          {t('dataSection')}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{t('dataHint')}</p>
        {!confirmDelete ? (
          <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
            {t('resetAsk')}
          </button>
        ) : (
          <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
            <p className="m-0 text-[15px] font-bold">{t('resetConfirm')}</p>
            <button type="button" disabled={busy !== null} className="min-h-12 w-full rounded-xl bg-danger px-4 font-extrabold text-white disabled:opacity-50" onClick={() => void remove()}>
              {busy === 'delete' ? t('deleting') : t('resetYes')}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setConfirmDelete(false)}>
              {t('cancel')}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
