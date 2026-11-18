# GĐ3 — Hội thoại AI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Phiên này chạy kiểu **Native** (tự làm, không subagent) theo giao việc.

**Goal:** Mỗi unit A1 kết thúc bằng nhập vai đúng chủ đề; màn gọi thoại với Bé Cu Tít (nói → STT → LLM → đọc); tổng kết lỗi/từ mới thêm vào ôn tập một chạm; quota AI theo ngày lưu DB.

**Architecture:** Nội dung (kịch bản + bài nhập vai) nằm ở `packages/content`; lộ trình (`mfe-path`) chỉ dẫn link URL sang `mfe-conversation` (không import chéo). Gọi thoại là một reducer thuần (TDD) + hook điều phối micro/STT/chat/TTS. Gateway giữ quota trong bảng `ai_usage` bằng upsert có điều kiện (nguyên tử).

**Tech Stack:** React 18 + Vite + Vitest (MFE), Fastify + Drizzle (PGlite/Postgres) + node:test (Gateway), Zod contracts, Playwright e2e.

**Spec:** `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 5 (GĐ3), 3.1b, 9 (D4, D9) + giao việc của phiên điều phối.

## Global Constraints
- 7 nguyên tắc `AGENTS.md`: contract trước (`packages/contracts`), đầu ra LLM JSON + Zod ở Gateway, UI không render HTML thô, không import chéo MFE (`pnpm lint:boundaries`).
- Mọi chuỗi UI vi + en qua `apps/mfe-*/src/i18n.ts`; lời gia sư/nhân vật luôn tiếng Việt.
- Nội dung mới `reviewed:false`.
- Không sửa file của phiên song song: `packages/state/src/sync.ts`, `packages/state/src/progress.ts`, gateway sync/`services/learner/repo.ts`/`routes/me.ts`, `routes/speech.ts`, `providers/*`, `packages/exercises`, `lib/audioUpload.ts`.
- Không commit khối turbo tự chèn vào `AGENTS.md`; `git add` theo đường dẫn cụ thể.
- Test dùng provider giả; Gemini thật chỉ thử 1 lượt cuối.
- Ngân sách bundle `.size-limit.cjs`; tải ban đầu ≤ 68.5 kB (không thêm gì vào bundle đầu).
- Quota theo **ngày UTC của server** (không tin ngày client gửi).
- e2e cổng riêng: `E2E_PORT=4213`, `E2E_GATEWAY_PORT=4040`.

## Review Focus
1. **Phát âm thanh treo** (headless/Android không bắn `end`) → vòng gọi phải tự đi tiếp sau watchdog. Test: reducer + hook “speakWithTimeout” trả về sau `max(3s, 90ms/ký tự)`.
2. **Micro bắt chính giọng gia sư** → micro đóng khi đang đọc (half-duplex). Test reducer: không có chuyển `SPEAKING → LISTENING` trước `SPOKEN`.
3. **Ồn liên tục / im lặng hoàn toàn** → không treo: chưa nghe tiếng nói 8 s ⇒ `no-speech`; nói liên tục ⇒ cắt ở 15 s. Test `SilenceDetector`.
4. **429 do rate-limit theo phút** không được báo “hết lượt hôm nay”. Test: chỉ `code === 'quota_exceeded'` mới hiện thông báo hết lượt.
5. **Offline/hết quota khi “Học tiếp” trỏ vào bài nhập vai** → có lối ra “Bỏ qua, sang bài sau” (không ghi là xong). Test e2e/unit cho link.

---

### Task 1: Nội dung — 3 kịch bản cuối unit + bài nhập vai trong unit

**Files:**
- Modify: `packages/content/src/data/scenarios.json` (thêm `sc5` u1 “Gặp hàng xóm mới”, `sc6` u2 “Mua trái cây ở chợ”, `sc7` u3 “Ăn trưa rồi hỏi đường”; kịch bản mới có `unit` + `reviewed:false`; 4 kịch bản cũ không đổi).
- Modify: `packages/content/src/scenarios/scenarios.ts` (`unit?: string; reviewed?: boolean`), `packages/content/src/course/course.ts` (`Lesson.roleplay?: string`).
- Modify: `packages/content/src/data/course/unit-{1,2,3}.json` thêm bài cuối `{id:"u1l5", title:"Nhập vai: Gặp hàng xóm mới", titleEn, roleplay:"sc5", exercises:[]}` (u2l5→sc6, u3l5→sc7).
- Test: `packages/content/test/course-roleplay.test.mjs`

**Interfaces — Produces:** `Lesson.roleplay?: string` (id kịch bản); `RoleplayScenario.unit?: string`; `scenarioForUnit(unitId): RoleplayScenario | undefined`.

- [ ] Test: mỗi unit có đúng 1 bài cuối có `roleplay`, trỏ tới kịch bản tồn tại có `unit === unit.id`, `reviewed === false`, `tasks.length === tasksEn.length` (3–4 nhiệm vụ); từ vựng nhiệm vụ đúng chủ đề (sc6 nhắc “dứa/thơm” hoặc số; sc7 nhắc “phở/cơm” và “ở đâu”).
- [ ] FAIL → sửa JSON + type → PASS → commit `feat(content): roleplay scenario closing each A1 unit`.

### Task 2: Gia sư giả lập + prompt cho kịch bản mới và chế độ gọi

**Files:** `apps/gateway/src/services/chat/mockTutor.ts`, `packages/prompts/src/PromptBuilder.ts`, test `apps/gateway/test/chat.test.mjs`.

- [ ] Test: với mọi `ROLEPLAY_SCENARIOS`, `TASK_KEYWORDS[id].length === tasks.length` và `NPC_NUDGE[id].length === tasks.length` (xuất qua export `MOCK_SCENARIO_IDS` hoặc kiểm qua route: hội thoại 2 lượt với sc5 hoàn thành ≥ 1 nhiệm vụ).
- [ ] Prompt: `setMode('chat'|'call')`; `call` ⇒ “văn nói, 1–2 câu ngắn, không emoji/markdown; đầu vào là bản chép lời giọng nói: KHÔNG sửa dấu thanh/viết hoa/dấu câu, chỉ sửa lỗi ngữ pháp/từ”. Thêm yêu cầu `newWords` (≤3 từ/cụm tiếng Việt có trong reply + nghĩa `en`). Tăng `PROMPT_VERSION` → `tutor-2026.11.2`.
- [ ] Commit `feat(gateway): mock tutor + prompt for unit roleplays and call mode`.

### Task 3: Contract + Gateway chat: `mode`, `newWords`, `turnsLeft`, bỏ TTS trong lượt

**Files:** `packages/contracts/src/api/chat.ts`, `apps/gateway/src/routes/chat.ts`, `apps/gateway/src/services/chat/tutor.ts`, test `apps/gateway/test/chat.test.mjs`.

**Interfaces — Produces:**
- `VoiceTurnRequest.mode: 'chat' | 'call'` (default `'chat'`).
- `done.newWords: {vi: string(≤40), en: string(≤80)}[]` (max 5, default `[]`).
- `done.turnsLeft?: number` (int ≥ 0).
- `TutorTurn.newWords`.

- [ ] Test: lượt mock có reply chứa từ của `COURSE_WORDS` ⇒ `newWords` gồm `{vi,en}` đó; live (LLM giả) trả `newWords` có từ không nằm trong reply ⇒ bị lọc; `mode:'call'` ⇒ prompt gửi LLM chứa chỉ dẫn văn nói; `maxOutputTokens` 300 khi call.
- [ ] Bỏ `ttsCache` khỏi `produce()` (TTS do client gọi `/speech/synthesize` sau `done`; tránh +độ trễ dưới watchdog 15 s và tránh đốt hạn mức TTS cho chat gõ).
- [ ] Commit `feat(chat): call mode, new words, turns left in done event`.

### Task 4: Quota AI theo ngày lưu DB + lượt/ngày + `GET /v1/quota`

**Files:**
- Modify: `packages/contracts/src/db/schema.ts` (bảng `ai_usage(user_id uuid FK cascade, usage_day_utc text, capability text, units int, updated_at)`, PK 3 cột).
- Create: `apps/gateway/drizzle/0001_ai_usage.sql` (sinh bằng `db:generate --name ai_usage`).
- Create: `apps/gateway/src/pipeline/DbQuotaStore.ts`; Modify `QuotaStore.ts` (interface mới), `RequestPipeline.ts`, `config.ts` (`MAX_CHAT_TURNS_PER_DAY` mặc định 60), `app.ts` (mặc định `DbQuotaStore`, giữ `opts.quotaStore`).
- Create: `apps/gateway/src/routes/quota.ts`; contract `QuotaStatusSchema` trong `packages/contracts/src/api/chat.ts`.
- Test: `apps/gateway/test/quota.test.mjs`.

**Interfaces — Produces:**
```ts
type Capability = 'stt' | 'tts' | 'llm' | 'vision' | 'turn';
interface QuotaStore {
  /** cộng nếu used+units ≤ limit; trả {ok, used} — nguyên tử */
  tryConsume(principalId: string, cap: Capability, units: number, limit: number): Promise<{ ok: boolean; used: number }>;
  add(principalId: string, cap: Capability, units: number): Promise<void>; // bù chênh lệch, không chặn
  get(principalId: string, cap: Capability): Promise<number>;
}
RequestPipeline.consume(req, cap, units): Promise<number /*used*/>; RequestPipeline.remaining(req, cap): Promise<number>;
QuotaStatus = { day: 'YYYY-MM-DD', resetAt: ISO, turns: {used, limit}, llmTokens: {used, limit}, sttSeconds: {used, limit} }
```
- 429 body: `{ error: 'quota_exceeded', capability, resetAt }`.
- Principal `anon:*` ⇒ bộ đếm trong RAM (không ghi DB).
- [ ] Tests: (a) lượt thứ `MAX_CHAT_TURNS_PER_DAY+1` ⇒ 429 `quota_exceeded`, `capability:'turn'`; (b) đếm còn sau khi dựng lại app trên cùng DB (DB dùng chung qua `opts.db`); (c) 2 user tách biệt; (d) 20 `tryConsume` song song với limit 5 ⇒ đúng 5 ok; (e) `GET /v1/quota` trả `turns.used` đúng, `resetAt` = nửa đêm UTC kế tiếp; (f) `done.turnsLeft` giảm dần; (g) `DELETE /v1/me` xóa `ai_usage` (cascade).
- [ ] Commit `feat(gateway): daily AI quota persisted in DB, chat turns per day`.

### Task 5: Lộ trình hiện bài “Nhập vai” cuối unit, link qua URL

**Files:** Create `apps/mfe-path/src/path/lessonHref.ts` (+test); Modify `PathHome.tsx`, `LessonScreen.tsx`, `i18n.ts`; test `apps/mfe-path/src/path/pathModel.test.ts`.

**Interfaces — Produces:** `lessonHref(lesson: Lesson): string` ⇒ bài thường `/bai-hoc/<id>`, bài nhập vai `/nhap-vai?kb=<scenario>&bai=<id>`.
- [ ] Tests: `lessonHref` hai nhánh; `nextLesson` sau `u1l4` là `u1l5`; `unitProgress(u1)` total = 5.
- [ ] PathHome: nhãn “🎭 Nhập vai” cho bài roleplay; “Học tiếp” dùng `lessonHref`; bài nhập vai là “next” thì có link phụ “Bỏ qua, sang bài sau” trỏ bài kế tiếp sau nó (không ghi xong). LessonScreen: `/bai-hoc/u1l5` ⇒ `<Navigate replace to={lessonHref}>`; nút “Học tiếp” ở tổng kết dùng `lessonHref`.
- [ ] Commit `feat(path): roleplay closes each unit, linked by URL`.

### Task 6: Tổng kết + thêm vào ôn tập một chạm (dùng chung nhập vai & gọi thoại)

**Files:** Create `apps/mfe-conversation/src/summary/sessionSummary.ts` (+test), `SessionSummary.tsx`; Modify `roleplay/RoleplayScreen.tsx`, `i18n.ts`.

**Interfaces — Produces:**
```ts
interface SummaryItem { key: string /* itemRef */; front: string; back: string; kind: 'mistake' | 'word' }
buildSummary(corrections: ChatCorrection[], words: {vi,en}[], youWrote: (t:string)=>string): SummaryItem[] // gộp trùng theo key, lỗi trước, từ sau
// key: lỗi `roleplay:<corrected lower>` (giữ như cũ), từ `conv:word:<vi lower NFC>`
<SessionSummary items onAdd(item) onAddAll() added:Set<string> />
```
- [ ] Tests: gộp trùng; từ đã có thẻ SRS vẫn hiện nhưng nút ghi “Đã có”; key ổn định.
- [ ] RoleplayScreen: đọc `kb`, `bai` từ `useSearchParams`; mở thẳng kịch bản `kb`; kết thúc (≥ 1 lượt xong) có `bai` ⇒ `progressStore.getState().completeLesson(bai, {total: tasks.length, firstTryCorrect: done.length})`, hiện XP và nút “Về lộ trình”; KHÔNG tự lưu thẻ nữa (một chạm).
- [ ] Commit `feat(conversation): session summary with one-tap add to review`.

### Task 7: Vòng gọi thoại — reducer + phát hiện ngừng nói

**Files:** Create `apps/mfe-conversation/src/call/silenceDetector.ts`, `callMachine.ts` (+tests); Modify `chat/useVoiceInput.ts` (tùy chọn `autoStop`).

**Interfaces — Produces:**
```ts
class SilenceDetector { constructor(o?: {silenceMs=1200, noSpeechMs=8000, maxMs=15000, minSpeechMs=300}); push(rms: number, tMs: number): 'none'|'end'|'no-speech'|'max' }
// ngưỡng tiếng nói = max(0.015, nền_ồn×3); nền ồn ước lượng 300 ms đầu
type CallPhase = 'idle'|'listening'|'transcribing'|'thinking'|'speaking'|'typing'|'ended'
callReducer(state, action) // actions: START, HEARD(text), NO_SPEECH, THOUGHT(reply), SPOKEN, TYPE, SEND_TYPED(text), ERROR(kind), HANG_UP
```
- [ ] Tests detector: im lặng ⇒ `no-speech` ở 8 s; nói 1 s rồi im 1.2 s ⇒ `end`; ồn liên tục ⇒ `max` ở 15 s; ồn nền thấp không tính là nói.
- [ ] Tests reducer: chu trình 2 lượt; `speaking` chỉ sang `listening` qua `SPOKEN`; lỗi micro ⇒ `typing`; `quota` ⇒ `ended` với lý do; `HANG_UP` từ mọi pha ⇒ `ended`.
- [ ] `useVoiceInput(onText, createBridge?, {autoStop?: boolean})`: autoStop đưa rms vào detector, `end|max` ⇒ `stop()`, `no-speech` ⇒ hủy + lỗi `no-speech`; bỏ guard `status` cũ (dùng ref) để lượt 2 không bị nuốt.
- [ ] Commit `feat(conversation): call state machine and end-of-speech detection`.

### Task 8: Màn gọi thoại `/goi-thoai`

**Files:** Create `apps/mfe-conversation/src/call/CallScreen.tsx`, `useCall.ts`, `speakReply.ts` (+test), `chat/VoiceConsent.tsx` (tách từ ChatPanel); Modify `ChatPanel.tsx`, `index.ts`, `i18n.ts`, `apps/host-shell/src/routes.tsx` (thêm `pathRoute('/goi-thoai', …)` vào `PATH_ROUTES`, KHÔNG vào `SCREENS`), Create `apps/host-shell/src/screens/CallRoute.tsx`; link vào từ màn Trò chuyện (“📞 Gọi Cu Tít”); `.size-limit.cjs` thêm `CallRoute-*.js`.

**Interfaces:**
- Consumes: `sendTurn` (thêm `mode:'call'`), `callReducer`, `useVoiceInput({autoStop})`, `buildSummary`/`SessionSummary`, `getDeviceSpeech().speak/stop`.
- Produces: `speakReply(text, {slow, audioUrl?, synth?: (text)=>Promise<string|null>}): Promise<'server'|'device'|'none'>` — thử `/v1/speech/synthesize` (time-box 4 s; 503 ⇒ nhớ “không có” cho cả phiên) ⇒ `Audio.playbackRate = slow ? 0.75 : 1`; lỗi ⇒ TTS máy `rate = speechRate(slow ? 0.7 : 0.95)`; luôn kết thúc trong watchdog `max(3000, 90×len)` ms (×1.4 khi chậm).
- [ ] Tests `speakReply`: 503 ⇒ máy, lần sau không gọi lại server; audio lỗi ⇒ máy; speak treo ⇒ trả sau watchdog.
- [ ] CallScreen: nút gọi lớn; xin đồng ý `voice` (VoiceConsent, câu cuối riêng cho gọi: “Lời bạn nói được gửi đi ngay khi bạn ngừng nói”); phụ đề bật/tắt (mặc định bật); “🐢 Nói chậm lại” (bật/tắt + đọc lại câu cuối); “⌨️ Gõ thay nói”; “Còn N lượt hôm nay”; tối đa 12 lượt/cuộc rồi tự sang tổng kết; gác máy ⇒ tổng kết (lỗi + từ mới) một chạm.
- [ ] Hết lượt (`code==='quota_exceeded'`): khung song ngữ “Hôm nay bạn đã dùng hết N lượt nói chuyện với AI. Lượt mới lúc HH:MM. Bài học và ôn tập vẫn dùng bình thường.” Rate-limit 429 khác ⇒ “Bạn gửi nhanh quá, đợi một chút rồi thử lại.”
- [ ] Commit `feat(conversation): voice call with Bé Cu Tít`.

### Task 9: e2e + kiểm tra toàn bộ + nhật ký + push

**Files:** Create `apps/host-shell/e2e/conversation.spec.ts`; Modify `apps/host-shell/e2e/path.spec.ts` (4/4 → 5/5, unit 1 đi qua nhập vai), `app.spec.ts` (nhập vai: một chạm lưu thẻ); `docs/nhat-ky/GD3.md`; ghi chú bàn giao ở thư mục ghi chú chung.
- [ ] e2e A: từ lộ trình, xong u1l1–u1l4 (ghi trực tiếp vào `becutit.progress` cho nhanh) ⇒ “Học tiếp” là “Nhập vai” ⇒ Gateway thật (mock tutor) 2 lượt gõ hoàn thành nhiệm vụ ⇒ tổng kết ⇒ unit 1 “5/5 bài”, XP tăng.
- [ ] e2e B: micro giả (tiếng 0.8 s rồi im lặng mỗi lần `getUserMedia`) ⇒ cuộc gọi 2 lượt với Gateway thật (STT mock “Xin chào bạn”) ⇒ phụ đề hiện 2 câu trả lời ⇒ gác máy ⇒ tổng kết ⇒ thêm 1 mục vào ôn tập.
- [ ] e2e C: hết lượt (route giả 429 `quota_exceeded`) ⇒ thông báo song ngữ.
- [ ] `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, `size`, e2e cổng 4213/4040; thử 1 lượt Gemini thật (mode call, gõ).
- [ ] Nhật ký, push `origin claude/gd3-hoi-thoai-cebfb5`.
