import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@vietlearning/ui';
import type { FriendRequest } from '@vietlearning/contracts/api';
import type { SocialClient } from '../client/types';
import { errCode, isOffline } from '../client/errors';
import { useT } from '../i18n';
import { Gate } from '../privacy/Gate';
import { isValidHandle, normalizeHandle } from '../privacy/HandleSetup';
import { ScreenFrame, card, input, Notice, primaryBtn, secondaryBtn } from '../ui';

function Requests({ client, onBack }: { client: SocialClient; onBack: () => void }) {
  const t = useT();
  const [items, setItems] = useState<FriendRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    client.rest.listFriendRequests().then(
      (r) => alive && setItems(r.requests),
      () => alive && setFailed(true)
    );
    return () => {
      alive = false;
    };
  }, [client, n]);

  const answer = async (r: FriendRequest, accept: boolean) => {
    setBusyId(r.id);
    try {
      await client.rest.respondFriendRequest(r.id, accept);
      setItems((l) => l?.filter((x) => x.id !== r.id) ?? l);
      setDone(accept ? t('req.accepted', { name: r.from.displayName }) : t('req.declined'));
    } catch {
      setDone(t('failed'));
    }
    setBusyId(null);
  };

  return (
    <ScreenFrame title={t('req.title')} back="/tin-nhan">
      {failed && (
        <EmptyState mood="buon" tone="error" title={t('failed')} action={<button type="button" className={secondaryBtn} onClick={() => setN((x) => x + 1)}>{t('retry')}</button>} />
      )}
      {!failed && items === null && <p role="status" className="m-0 text-ink-muted">{t('loading')}</p>}
      {done && <Notice>{done}</Notice>}
      {items?.length === 0 && <EmptyState mood="ngu" title={t('req.empty')} />}
      {items && items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((r) => (
            <li key={r.id} className={card}>
              <p className="m-0 text-[15px] text-ink">
                <b>{r.from.displayName}</b> · {t('req.wants')}
              </p>
              <div className="flex gap-2">
                <button type="button" className={primaryBtn} disabled={busyId === r.id} onClick={() => void answer(r, true)}>
                  {t('req.accept')}
                </button>
                <button type="button" className={secondaryBtn} disabled={busyId === r.id} onClick={() => void answer(r, false)}>
                  {t('req.decline')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="min-h-11 text-left font-bold text-accent-text" onClick={onBack}>
        {t('req.backToFind')}
      </button>
    </ScreenFrame>
  );
}

function Find({ client }: { client: SocialClient }) {
  const t = useT();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [view, setView] = useState<'find' | 'requests'>('find');
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    client.rest.listFriendRequests().then(
      (r) => alive && setCount(r.requests.length),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [client, view]);

  if (view === 'requests') return <Requests client={client} onBack={() => setView('find')} />;

  const submit = async () => {
    const h = normalizeHandle(handle);
    if (!isValidHandle(h)) return setMsg({ tone: 'error', text: t('find.badHandle') });
    setBusy(true);
    setMsg(null);
    try {
      await client.rest.createFriendRequest(h);
      setHandle('');
      setMsg({ tone: 'info', text: t('find.sent') });
    } catch (e) {
      const c = errCode(e);
      // Mọi trường hợp "không thấy" cùng MỘT câu trung tính (Gateway cũng trả cùng một lỗi: không dò người dùng)
      const text = c === 'handle_not_found' ? t('find.err.handle_not_found') : c === 'request_limit' ? t('find.err.request_limit') : c === 'already_friends' ? t('find.err.already_friends') : isOffline(e) ? t('offline') : t('find.err.other');
      setMsg({ tone: 'error', text });
    }
    setBusy(false);
  };

  return (
    <ScreenFrame title={t('find.title')} back="/tin-nhan">
      <form
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="friend-handle" className="text-[15px] font-bold text-ink-soft">
          {t('find.label')}
        </label>
        <input id="friend-handle" className={input} value={handle} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="friend-handle-hint" onChange={(e) => setHandle(e.target.value)} />
        <p id="friend-handle-hint" className="m-0 text-sm text-ink-muted">
          {t('find.hint')}
        </p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <button type="submit" className={primaryBtn} disabled={busy || !handle.trim()}>
          {busy ? t('find.sending') : t('find.submit')}
        </button>
      </form>
      <button type="button" className="min-h-11 text-left font-bold text-accent-text" onClick={() => setView('requests')}>
        {count > 0 ? t('find.viewRequests', { n: count }) : t('find.viewRequestsNone')}
      </button>
      <Link to="/moi" className="inline-flex min-h-11 items-center font-bold text-accent-text">
        {t('find.orCode')} {t('find.enterCode')}
      </Link>
    </ScreenFrame>
  );
}

/** Thêm bạn bằng tên (handle) + lời mời đến (`/ban-be/tim`) — đi qua cổng tuổi/handle trước. */
export function FindFriendScreen({ client }: { client: SocialClient }) {
  const t = useT();
  return (
    <Gate client={client} title={t('find.title')}>
      <Find client={client} />
    </Gate>
  );
}
