import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { accuracyBySkill, cefrLabel, computeStreak, dueCards, useLearner, type SrsCard, type Skill } from '@vietlearning/state';
import { ScreenFrame, card, linkBtn, primaryBtn } from '../common/ui';
import { ReviewSession } from './ReviewSession';
import { formatDue, lastSevenDays, nextDue } from './stats';

const SKILL_LABEL: Record<Skill, string> = {
  pronunciation: 'Phát âm',
  honorific: 'Xưng hô',
  drill: 'Luyện tập',
  sentence: 'Ghép câu',
  dialect: 'Phương ngữ',
  vision: 'Camera',
  conversation: 'Hội thoại'
};

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line-strong bg-surface p-3">
      <span className="text-2xl font-black text-heading">{value}</span>
      <span className="text-sm text-ink-muted">{label}</span>
    </div>
  );
}

/** Màn hình M9: chuỗi ngày, thời gian học, độ chính xác theo kỹ năng, ôn thẻ SM-2 đến hạn. Dữ liệu offline trên máy. */
export function ProgressScreen() {
  const profile = useLearner((s) => s.profile);
  const activity = useLearner((s) => s.activity);
  const attempts = useLearner((s) => s.attempts);
  const srs = useLearner((s) => s.srs);
  const [reviewing, setReviewing] = useState<SrsCard[] | null>(null);

  const week = useMemo(() => lastSevenDays(activity), [activity]);
  const weekMinutes = week.reduce((a, d) => a + d.minutes, 0);
  const max = Math.max(10, ...week.map((d) => d.minutes));
  const streak = computeStreak(activity);
  const due = useMemo(() => dueCards(srs), [srs]);
  const upcoming = due.length === 0 ? nextDue(srs) : null;
  const acc = Object.entries(accuracyBySkill(attempts)) as [Skill, { total: number; correct: number; rate: number }][];
  const totalCards = Object.keys(srs).length;

  return (
    <ScreenFrame
      title="Tiến độ học"
      action={
        <Link to="/tuy-chinh" className={linkBtn}>
          ⚙️ Tùy chỉnh
        </Link>
      }
    >
      {reviewing ? (
        <ReviewSession cards={reviewing} onClose={() => setReviewing(null)} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile value={`${streak} ngày`} label="Chuỗi ngày học" />
            <Tile value={`${weekMinutes} phút`} label="Học trong 7 ngày" />
            <Tile value={profile.onboarded ? cefrLabel(profile.level) : '—'} label="Trình độ" />
            <Tile value={String(due.length)} label="Thẻ cần ôn" />
          </div>

          <section className={card} aria-labelledby="ct-srs">
            <h2 id="ct-srs" className="m-0 text-lg font-extrabold text-ink">
              Ôn tập ngắt quãng
            </h2>
            {totalCards === 0 ? (
              <>
                <p className="m-0 text-[15px] text-ink-soft">Chưa có thẻ nào. Bài làm sai và từ bạn lưu sẽ vào đây để ôn đúng lúc sắp quên.</p>
                <div className="flex flex-wrap gap-2">
                  <Link to="/luyen-tap" className={linkBtn}>
                    🧩 Luyện tập
                  </Link>
                  <Link to="/phuong-ngu" className={linkBtn}>
                    🗺️ Phương ngữ
                  </Link>
                </div>
              </>
            ) : due.length > 0 ? (
              <>
                <p className="m-0 text-[15px] text-ink-soft">
                  {due.length} / {totalCards} thẻ đến hạn hôm nay.
                </p>
                <button type="button" className={primaryBtn} onClick={() => setReviewing(due.slice(0, 20))}>
                  Ôn {Math.min(20, due.length)} thẻ
                </button>
              </>
            ) : (
              <p className="m-0 text-[15px] text-ink-soft">
                Đã ôn hết {totalCards} thẻ. {upcoming ? `Thẻ tiếp theo đến hạn ${formatDue(upcoming)}.` : ''}
              </p>
            )}
          </section>

          <section className={card} aria-labelledby="ct-week">
            <h2 id="ct-week" className="m-0 text-lg font-extrabold text-ink">
              Phút học 7 ngày qua
            </h2>
            {/* Một chuỗi số liệu => không cần chú giải; danh sách ẩn bên dưới là bản bảng cho trình đọc màn hình */}
            <div className="flex h-32 items-end gap-2 border-b border-line" aria-hidden="true">
              {week.map((d) => (
                <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${d.minutes} phút`}>
                  {(d.isToday || d.minutes === max) && d.minutes > 0 && <span className="text-xs font-bold text-ink-soft">{d.minutes}</span>}
                  <div className="w-full max-w-7 rounded-t-[4px] bg-accent" style={{ height: `${(d.minutes / max) * 100}%`, minHeight: d.minutes > 0 ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2" aria-hidden="true">
              {week.map((d) => (
                <span key={d.key} className={['flex-1 text-center text-xs', d.isToday ? 'font-bold text-ink' : 'text-ink-muted'].join(' ')}>
                  {d.label}
                </span>
              ))}
            </div>
            <ul className="sr-only">
              {week.map((d) => (
                <li key={d.key}>
                  {d.label}: {d.minutes} phút
                </li>
              ))}
            </ul>
          </section>

          <section className={card} aria-labelledby="ct-acc">
            <h2 id="ct-acc" className="m-0 text-lg font-extrabold text-ink">
              Độ chính xác theo kỹ năng
            </h2>
            {acc.length === 0 ? (
              <p className="m-0 text-[15px] text-ink-soft">Làm vài bài luyện tập để xem thống kê.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {acc.map(([skill, r]) => (
                  <li key={skill} className="flex flex-col gap-1">
                    <span className="flex justify-between text-[15px]">
                      <span className="font-bold text-ink">{SKILL_LABEL[skill]}</span>
                      <span className="text-ink-soft">
                        {r.rate}% · {r.correct}/{r.total} bài
                      </span>
                    </span>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${r.rate}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link to="/bat-dau" className={`${linkBtn} justify-center`}>
            🌱 {profile.onboarded ? 'Làm lại bài xếp lớp' : 'Làm quen & xếp lớp'}
          </Link>
        </>
      )}
    </ScreenFrame>
  );
}
