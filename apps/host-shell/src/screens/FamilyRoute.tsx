import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { GatewayRequestError } from '@vietlearning/api-client';
import { normalizeRecoveryCode, type ChildProfile } from '@vietlearning/contracts/api';
import { useLearner } from '@vietlearning/state';
import { familyErrorText, familyStore, hashPin, isValidPin, verifyPin, PIN_MAX } from '@vietlearning/state/family';
import { useT } from '../familyI18n';
import * as fam from '../account/family';
import { session } from '../account/bootstrap';

type T = ReturnType<typeof useT>;

// Lớp Tailwind giống mfe-learner (đã có trong CSS toàn app) => không thêm CSS
const card = 'flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card';
const primaryBtn = 'min-h-12 w-full rounded-xl bg-accent px-4 font-extrabold text-accent-ink disabled:opacity-50';
const secondaryBtn = 'min-h-12 w-full rounded-xl border border-line-strong bg-surface-2 px-4 font-bold text-ink';
const input = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 font-mono text-base text-ink';
const label = 'flex flex-col gap-1 text-[15px] font-bold text-ink-soft';

function errorText(err: unknown, t: T, lang: 'vi' | 'en'): string {
  if (err instanceof fam.SwitchError) return err.reason === 'offline' ? t('needNetwork') : t('noParent');
  if (err instanceof GatewayRequestError && (err.kind === 'offline' || err.kind === 'timeout')) return t('needNetwork');
  if (err instanceof GatewayRequestError && err.code === 'child_limit_reached') return t('limit');
  return familyErrorText(err, lang) ?? t('failed');
}

function PinInput({ id, value, onChange, labelText }: { id: string; value: string; onChange: (v: string) => void; labelText: string }) {
  return (
    <label className={label} htmlFor={id}>
      {labelText}
      <input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className={input}
      />
    </label>
  );
}

/** Đặt mã PIN phụ huynh (lưu PBKDF2 + muối, không lưu PIN thô) */
function PinSetup({ t, onDone }: { t: T; onDone: () => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPin(a)) return setErr(t('pinInvalid'));
    if (a !== b) return setErr(t('pinMismatch'));
    setBusy(true);
    familyStore.getState().setPin(await hashPin(a));
    setBusy(false);
    onDone();
  };
  return (
    <form className={card} onSubmit={(e) => void submit(e)} aria-labelledby="fm-pin">
      <h2 id="fm-pin" className="m-0 text-lg font-extrabold text-ink">
        {t('pinSetTitle')}
      </h2>
      <p className="m-0 text-sm text-ink-muted">{t('pinSetHint')}</p>
      <PinInput id="fm-pin-a" value={a} onChange={setA} labelText={t('pinNew')} />
      <PinInput id="fm-pin-b" value={b} onChange={setB} labelText={t('pinAgain')} />
      {err && (
        <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-[15px] text-danger-ink">
          {err}
        </p>
      )}
      <button type="submit" className={primaryBtn} disabled={busy}>
        {t('pinSave')}
      </button>
    </form>
  );
}

/** Cổng phụ huynh: PIN (khóa tăng dần khi sai) hoặc mã khôi phục của tài khoản phụ huynh */
function ParentGate({ t, onUnlock, onForgotOk }: { t: T; onUnlock: () => void; onForgotOk: () => void }) {
  const pin = familyStore((s) => s.pin);
  const lockedUntil = familyStore((s) => s.lockedUntil);
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [forgot, setForgot] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (lockedUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil, now]);
  const locked = lockedUntil > now;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin || locked) return;
    const ok = await verifyPin(value, pin);
    familyStore.getState().recordAttempt(ok);
    setValue('');
    if (ok) onUnlock();
    else setErr(t('gateWrong'));
    setNow(Date.now());
  };
  const checkCode = async (e: FormEvent) => {
    e.preventDefault();
    const parent = await session().parentInfo();
    if (parent?.recoveryCode && normalizeRecoveryCode(parent.recoveryCode) === normalizeRecoveryCode(code)) onForgotOk();
    else setErr(t('forgotBad'));
  };

  return (
    <section className={card} aria-labelledby="fm-gate">
      <h2 id="fm-gate" className="m-0 text-lg font-extrabold text-ink">
        🔒 {t('gateTitle')}
      </h2>
      {!forgot && pin ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
          <p className="m-0 text-sm text-ink-muted">{t('gateHint')}</p>
          <PinInput id="fm-gate-pin" value={value} onChange={setValue} labelText={t('gateInput')} />
          <button type="submit" className={primaryBtn} disabled={locked || value.length < 4}>
            {t('gateOk')}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setForgot(true)}>
            {t('forgot')}
          </button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => void checkCode(e)}>
          <p className="m-0 text-sm text-ink-muted">{t('forgotHint')}</p>
          <label className={label}>
            {t('forgotInput')}
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" maxLength={40} className={input} />
          </label>
          <button type="submit" className={primaryBtn} disabled={code.replace(/[\s-]/g, '').length < 16}>
            {t('forgotOk')}
          </button>
        </form>
      )}
      {(locked || err) && (
        <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-[15px] text-danger-ink">
          {locked ? t('gateLocked', { s: Math.ceil((lockedUntil - now) / 1000) }) : err}
        </p>
      )}
    </section>
  );
}

function KidCard({ kid, index, t, busy, run, onChanged }: { kid: ChildProfile; index: number; t: T; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; onChanged: (k: ChildProfile | null) => void }) {
  const name = familyStore((s) => s.names[kid.userId]) || t('kidDefault', { n: index + 1 });
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fam.childSummary>> | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3" data-testid="kid">
      <span className="text-base font-extrabold text-ink">🧒 {name}</span>
      <button type="button" className={primaryBtn} disabled={busy} onClick={() => void run(() => fam.enterChild(kid.userId))}>
        {t('use')}
      </button>
      <button type="button" className={secondaryBtn} disabled={busy} onClick={() => void run(async () => setSummary(await fam.childSummary(kid.userId)))}>
        {t('progress')}
      </button>
      {summary && (
        <p role="status" className="m-0 text-sm text-ink-soft">
          {t('progressLine', { min: summary.studyMinutes, streak: summary.streakDays, acc: Math.round(summary.accuracyRate), due: summary.dueCardsCount })}
        </p>
      )}
      <label className="flex items-start gap-2 text-[15px] text-ink">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={kid.mediaConsent}
          disabled={busy}
          onChange={(e) => {
            const media = e.target.checked;
            void run(async () => onChanged(await fam.setChildConsent(kid.userId, media)));
          }}
        />
        <span>{t('consentLabel')}</span>
      </label>
      <p className="m-0 text-sm text-ink-muted">{t('consentHint')}</p>
      {!confirm ? (
        <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setConfirm(true)}>
          {t('remove')}
        </button>
      ) : (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-danger-ink">
          <p className="m-0 text-[15px] font-bold">{t('removeConfirm', { name })}</p>
          <button
            type="button"
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-danger px-4 font-extrabold text-white disabled:opacity-50"
            onClick={() => void run(async () => (await fam.deleteChild(kid.userId), onChanged(null)))}
          >
            {t('removeYes')}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => setConfirm(false)}>
            {t('cancel')}
          </button>
        </div>
      )}
    </li>
  );
}

/** GĐ4b — /tuy-chinh?muc=gia-dinh: phụ huynh tạo hồ sơ trẻ, chuyển hồ sơ trên máy, xem tiến độ, cho phép ảnh/giọng nói. */
export default function FamilyRoute() {
  const t = useT();
  const lang = useLearner((s) => s.preferences.uiLanguage);
  const navigate = useNavigate();
  const mode = familyStore((s) => s.mode);
  const pin = familyStore((s) => s.pin);
  const activeName = familyStore((s) => (s.activeChildId ? s.names[s.activeChildId] : undefined));
  const [kids, setKids] = useState<ChildProfile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [resetPin, setResetPin] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      if (mounted.current) setMsg(errorText(err, t, lang));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (mode !== 'adult') return;
    void run(async () => {
      const { children } = await fam.listChildren();
      if (!mounted.current) return;
      setKids(children);
      familyStore.setState({ childCount: children.length });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const exit = () => run(async () => fam.exitChild());

  return (
    <div className="min-h-dvh bg-canvas px-4 pb-8 pt-[calc(16px+env(safe-area-inset-top))] font-sans text-ink">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-2 border-b-2 border-line pb-4">
          <h1 className="m-0 text-[26px] font-black leading-tight tracking-tight text-heading">👨‍👩‍👧 {t('title')}</h1>
          <button type="button" className="min-h-12 px-2 font-bold text-ink-soft" onClick={() => navigate(-1)}>
            {t('back')}
          </button>
        </header>

        {mode === 'child' ? (
          <>
            <section className={card}>
              <p className="m-0 text-base font-extrabold text-ink" data-testid="child-now">
                {t('childNow', { name: activeName || t('kidDefault', { n: 1 }) })}
              </p>
              <p className="m-0 text-[15px] text-ink-soft">{t('childLead')}</p>
            </section>
            {resetPin ? <PinSetup t={t} onDone={() => void exit()} /> : <ParentGate t={t} onUnlock={() => void exit()} onForgotOk={() => setResetPin(true)} />}
          </>
        ) : !pin || resetPin ? (
          <>
            <p className="m-0 text-[15px] text-ink-soft">{t('lead')}</p>
            <PinSetup t={t} onDone={() => setResetPin(false)} />
          </>
        ) : (
          <>
            <p className="m-0 text-[15px] text-ink-soft">{t('lead')}</p>
            <section className={card} aria-labelledby="fm-kids">
              <h2 id="fm-kids" className="m-0 text-lg font-extrabold text-ink">
                {t('kidsTitle')}
              </h2>
              {kids && kids.length === 0 && <p className="m-0 text-sm text-ink-muted">{t('kidsNone')}</p>}
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {kids?.map((k, i) => (
                  <KidCard
                    key={k.userId}
                    kid={k}
                    index={i}
                    t={t}
                    busy={busy}
                    run={run}
                    onChanged={(next) => setKids((cur) => (cur ?? []).flatMap((c) => (c.userId !== k.userId ? [c] : next ? [next] : [])))}
                  />
                ))}
              </ul>
            </section>
            <form
              className={card}
              aria-labelledby="fm-add"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const child = await fam.createChild(name);
                  setName('');
                  setKids((cur) => [...(cur ?? []), child]);
                });
              }}
            >
              <h2 id="fm-add" className="m-0 text-lg font-extrabold text-ink">
                {t('addTitle')}
              </h2>
              <label className={label}>
                {t('addName')}
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="off" className={input} />
              </label>
              <button type="submit" className={primaryBtn} disabled={busy || !name.trim()}>
                {t('add')}
              </button>
            </form>
            <p className="m-0 text-sm text-ink-muted">🔔 {t('reminders')}</p>
            <button type="button" className={secondaryBtn} onClick={() => setResetPin(true)}>
              {t('pinSetTitle')}
            </button>
          </>
        )}

        {busy && (
          <p role="status" className="m-0 text-sm text-ink-muted">
            {t('working')}
          </p>
        )}
        {msg && (
          <p role="alert" className="m-0 rounded-xl bg-danger-soft p-3 text-[15px] text-danger-ink">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
