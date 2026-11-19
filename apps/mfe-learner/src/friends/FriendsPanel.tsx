import { useEffect, useRef, useState, type FormEvent } from 'react';
import { request } from '@vietlearning/api-client';
import {
  FriendInviteResponseSchema,
  FriendProfileResponseSchema,
  FriendQuestSchema,
  FriendRemoveResponseSchema,
  FriendsResponseSchema,
  QUEST_GOAL_OPTIONS,
  type FriendInvite,
  type FriendQuest,
  type FriendsResponse
} from '@vietlearning/contracts/api';
import { dayKey, useLearner } from '@vietlearning/state';
import { BusyLabel, Spinner, primaryBtn, secondaryBtn } from '../common/ui';
import { useT } from './i18n';

/** Gọi Gateway /v1/friends (test tiêm bản giả). `today` = ngày địa phương để tính tuần của nhiệm vụ chung */
export interface FriendsApi {
  list(today: string): Promise<FriendsResponse>;
  setName(displayName: string): Promise<string>;
  invite(): Promise<FriendInvite>;
  accept(code: string, today: string): Promise<FriendQuest>;
  setGoal(id: string, goalMinutes: number, today: string): Promise<FriendQuest>;
  remove(id: string): Promise<void>;
}

const gatewayApi: FriendsApi = {
  list: (today) => request(`/v1/friends?today=${today}`, { schema: FriendsResponseSchema }),
  setName: async (displayName) => (await request('/v1/friends/profile', { method: 'PUT', body: { displayName }, schema: FriendProfileResponseSchema })).displayName,
  invite: () => request('/v1/friends/invite', { method: 'POST', schema: FriendInviteResponseSchema }),
  accept: (code, today) => request(`/v1/friends/accept?today=${today}`, { body: { code }, schema: FriendQuestSchema }),
  setGoal: (id, goalMinutes, today) => request(`/v1/friends/${id}/goal?today=${today}`, { method: 'PUT', body: { goalMinutes }, schema: FriendQuestSchema }),
  remove: async (id) => void (await request(`/v1/friends/${id}`, { method: 'DELETE', schema: FriendRemoveResponseSchema }))
};

type T = ReturnType<typeof useT>;
type Msg = { kind: 'ok' | 'error'; text: string } | null;
const input = 'min-h-12 w-full rounded-xl border-2 border-line bg-surface-2 px-3 text-ink';

/** Mã lỗi Gateway => câu dễ hiểu (không lộ chi tiết kỹ thuật) */
function errText(e: unknown, t: T): string {
  const x = e as { kind?: string; code?: string; status?: number };
  if (x?.kind === 'offline' || x?.kind === 'timeout') return t('offline');
  if (x?.status === 429) return t('err.rate');
  const known = ['invite_invalid', 'self_invite', 'already_friends', 'friend_limit', 'display_name_required'];
  return x?.code && known.includes(x.code) ? t(`err.${x.code}` as Parameters<T>[0]) : t('err.other');
}

/** `busy` = đang có yêu cầu bất kỳ (khóa mọi nút gây thay đổi); `pending` = yêu cầu đang chạy là của thẻ này */
function Quest({ f, t, busy, pending, onGoal, onRemove }: { f: FriendQuest; t: T; busy: boolean; pending: 'goal' | 'remove' | null; onGoal: (g: number) => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const q = f.quest;
  const pct = Math.min(100, Math.round((q.totalMinutes / q.goalMinutes) * 100));
  const goalId = `goal-${f.id}`;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-3" aria-label={t('questTitle', { name: f.displayName })}>
      <h3 className="m-0 text-base font-extrabold text-ink">{t('questTitle', { name: f.displayName })}</h3>
      <p className="m-0 font-bold text-ink">{t('questWe', { total: q.totalMinutes, goal: q.goalMinutes })}</p>
      {/* Một thanh “chúng ta” — không tách màu theo người để không thành so sánh ai hơn ai */}
      <div className="h-3 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={q.totalMinutes} aria-valuemin={0} aria-valuemax={q.goalMinutes} aria-label={t('questWe', { total: q.totalMinutes, goal: q.goalMinutes })}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="m-0 text-[15px] text-ink-soft">{q.completed ? t('questDone') : t('questLeft', { n: q.goalMinutes - q.totalMinutes })}</p>
      <p className="m-0 text-[15px] text-ink-soft">{q.streakWeeks > 0 ? t('streak', { n: q.streakWeeks }) : t('streakNone')}</p>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-ink-muted">{t('contribution')}</span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
          {q.members.map((m) => (
            <li key={m.me ? 'me' : 'friend'}>{`${m.me ? t('you') : m.displayName}: ${t('mins', { n: m.minutes })}`}</li>
          ))}
        </ul>
      </div>
      <label htmlFor={goalId} className="text-sm font-bold text-ink-soft">
        {t('goalLabel')}
      </label>
      <select id={goalId} className={`${input} disabled:opacity-60`} value={q.goalMinutes} disabled={busy} aria-busy={pending === 'goal'} onChange={(e) => onGoal(Number(e.target.value))}>
        {QUEST_GOAL_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {t('goalOpt', { n })}
          </option>
        ))}
      </select>
      {pending === 'goal' && (
        <p role="status" className="m-0 flex items-center gap-2 text-sm text-ink-muted">
          <Spinner />
          {t('working')}
        </p>
      )}
      {confirm ? (
        <div className="flex flex-col gap-2" role="group">
          <p className="m-0 text-[15px] text-ink">{t('removeConfirm', { name: f.displayName })}</p>
          <button type="button" className={primaryBtn} disabled={busy} onClick={onRemove}>
            <BusyLabel busy={pending === 'remove'} label={t('removeYes')} busyLabel={t('working')} />
          </button>
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setConfirm(false)}>
            {t('cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setConfirm(true)}>
          {t('remove')}
        </button>
      )}
    </section>
  );
}

/**
 * GĐ4c — Bạn học hợp tác (chunk lười, mở từ màn Tiến độ). Không có bảng xếp hạng (D7): mỗi cặp bạn một
 * nhiệm vụ tuần chung “chúng ta”, thành viên luôn theo thứ tự cố định (mình trước).
 */
export function FriendsPanel({ api = gatewayApi }: { api?: FriendsApi }) {
  const t = useT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [load, setLoad] = useState<'loading' | 'ok' | 'error'>('loading');
  const [loadErr, setLoadErr] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  /** Thao tác đang chờ server (null = rảnh). Ref chặn đồng bộ: hai lần chạm trước khi kịp vẽ lại vẫn chỉ gửi một yêu cầu */
  const [busy, setBusyState] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const alive = useRef(true);
  const today = () => dayKey(new Date());

  const refresh = async () => {
    try {
      const d = await api.list(today());
      if (!alive.current) return;
      setData(d);
      setLoad('ok');
    } catch (e) {
      if (!alive.current) return;
      setLoadErr(errText(e, t) === t('err.other') ? t('failed') : errText(e, t));
      setLoad('error');
    }
  };

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (what: string, fn: () => Promise<Msg>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyState(what);
    setMsg(null);
    try {
      const m = await fn();
      if (alive.current) setMsg(m);
    } catch (e) {
      if (alive.current) setMsg({ kind: 'error', text: errText(e, t) });
    } finally {
      // giữ khóa tới khi danh sách mới về, để nút không bật lại trên dữ liệu cũ
      await refresh();
      busyRef.current = false;
      if (alive.current) setBusyState(null);
    }
  };

  if (load === 'loading')
    return (
      <p role="status" className="m-0 flex items-center gap-2 text-[15px] text-ink-soft">
        <Spinner />
        {t('loading')}
      </p>
    );
  if (load === 'error' || !data)
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[15px] text-ink-soft">{loadErr}</p>
        <button type="button" className={secondaryBtn} onClick={() => (setLoad('loading'), void refresh())}>
          {t('retry')}
        </button>
      </div>
    );

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    void run('name', async () => {
      try {
        await api.setName(name);
        if (alive.current) setRenaming(false);
      } catch (err) {
        if ((err as { status?: number }).status === 400) return { kind: 'error', text: t('nameBad') };
        throw err;
      }
      return null;
    });
  };

  const acceptCode = (e: FormEvent) => {
    e.preventDefault();
    void run('accept', async () => {
      const f = await api.accept(code.trim(), today());
      setCode('');
      return { kind: 'ok', text: t('acceptOk', { name: f.displayName }) };
    });
  };

  const full = data.friends.length >= data.maxFriends;
  const status = msg && (
    <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`m-0 rounded-xl p-3 text-[15px] ${msg.kind === 'error' ? 'bg-danger-soft text-danger-ink' : 'bg-surface-2 text-ink'}`}>
      {msg.text}
    </p>
  );

  /** Form tên hiển thị: lần đầu (bắt buộc) hoặc đổi tên sau này (có nút Thôi) */
  const nameForm = (onCancel?: () => void) => (
    <form className="flex flex-col gap-2" onSubmit={saveName}>
      <p className="m-0 text-sm text-ink-muted">{t('privacy')}</p>
      <label htmlFor="friend-name" className="text-[15px] font-bold text-ink-soft">
        {t('nameLabel')}
      </label>
      <input id="friend-name" className={input} value={name} maxLength={40} autoComplete="nickname" onChange={(e) => setName(e.target.value)} aria-describedby="friend-name-hint" />
      <span id="friend-name-hint" className="text-sm text-ink-muted">
        {t('nameHint')}
      </span>
      <button type="submit" className={primaryBtn} disabled={busy !== null || name.trim().length < 2}>
        <BusyLabel busy={busy === 'name'} label={t('nameSave')} busyLabel={t('working')} />
      </button>
      {onCancel && (
        <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={onCancel}>
          {t('cancel')}
        </button>
      )}
      {status}
    </form>
  );

  if (!data.displayName) return nameForm();

  return (
    <div className="flex flex-col gap-4">
      {renaming ? (
        nameForm(() => (setRenaming(false), setMsg(null)))
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm text-ink-muted">
            {t('youAre', { name: data.displayName })}. {t('privacy')}
          </p>
          <button type="button" className={`${secondaryBtn} self-start`} disabled={busy !== null} onClick={() => (setName(data.displayName ?? ''), setMsg(null), setRenaming(true))}>
            {t('rename')}
          </button>
        </div>
      )}

      {data.friends.length === 0 ? (
        <p className="m-0 text-[15px] text-ink-soft">{t('empty')}</p>
      ) : (
        data.friends.map((f) => (
          <Quest
            key={f.id}
            f={f}
            t={t}
            busy={busy !== null}
            pending={busy === `goal:${f.id}` ? 'goal' : busy === `remove:${f.id}` ? 'remove' : null}
            onGoal={(g) => void run(`goal:${f.id}`, async () => (await api.setGoal(f.id, g, today()), null))}
            onRemove={() => void run(`remove:${f.id}`, async () => (await api.remove(f.id), null))}
          />
        ))
      )}
      {!renaming && status}

      {full ? (
        <p className="m-0 text-[15px] text-ink-soft">{t('full', { n: data.maxFriends })}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-base font-extrabold text-ink">{t('inviteTitle')}</h3>
            <p className="m-0 text-sm text-ink-muted">{t('inviteHint')}</p>
            {data.invite && (
              <div className="flex flex-col gap-1">
                <span className="text-sm text-ink-muted">{t('inviteCode')}</span>
                <span data-testid="friend-invite-code" className="select-all font-mono text-2xl font-black tracking-widest text-heading">
                  {data.invite.code}
                </span>
                <span className="text-sm text-ink-muted">
                  {t('inviteExpires', { when: new Date(data.invite.expiresAt).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) })}
                </span>
                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => void navigator.clipboard?.writeText(data.invite!.code).then(() => alive.current && setCopied(true), () => undefined)}
                >
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
            )}
            <button type="button" className={data.invite ? secondaryBtn : primaryBtn} disabled={busy !== null} onClick={() => void run('invite', async () => (setCopied(false), await api.invite(), null))}>
              <BusyLabel busy={busy === 'invite'} label={data.invite ? t('inviteNew') : t('inviteCreate')} busyLabel={t('working')} />
            </button>
          </div>

          <form className="flex flex-col gap-2" onSubmit={acceptCode}>
            <label htmlFor="friend-code" className="text-[15px] font-bold text-ink-soft">
              {t('acceptLabel')}
            </label>
            <input id="friend-code" className={`${input} font-mono uppercase`} value={code} maxLength={20} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX" onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className={primaryBtn} disabled={busy !== null || code.trim().length < 8}>
              <BusyLabel busy={busy === 'accept'} label={t('acceptBtn')} busyLabel={t('working')} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default FriendsPanel;
