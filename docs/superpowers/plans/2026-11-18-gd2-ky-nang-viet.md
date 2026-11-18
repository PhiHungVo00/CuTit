# GĐ2 — Kỹ năng đặc thù tiếng Việt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Phiên này tự thực hiện (Native, theo brief “tự thực hiện, không hỏi”).

**Goal:** Chấm phát âm câu thật (A3), giọng đọc theo miền dựng sẵn (D9), phòng tập thanh điệu, chế độ miền trong bài học và giải thích câu trả lời bằng LLM.

**Architecture:** Contract trước (`packages/contracts/src/api/speech.ts`), Gateway thêm năng lực `stt`/`tts` trừu tượng (Nguyên tắc 4) và dịch vụ A3 trong `services/assessment/`. Âm thanh khóa học dựng sẵn bằng script → thư mục tĩnh theo hash + manifest theo gói (unit × miền) → client tải theo unit vào Cache Storage, thiếu thì dùng TTS máy. Mọi UI mới là chunk lazy.

**Tech Stack:** Fastify 4, Zod, Drizzle/PGlite (không thêm migration), React 18, Vitest, node:test, Playwright, Gemini REST (`generateContent` cho STT/LLM, model TTS với `responseModalities: ['AUDIO']`).

**Spec:** brief của phiên + `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 3.1b, 4 (R5), 5 (GĐ2 điểm 1, 2, 3, 5), 9 (D9). Điểm 4 (xưng hô ngữ cảnh) và 6 (Stories) KHÔNG thuộc brief này.

## Global Constraints
- 7 nguyên tắc `AGENTS.md`; A3 ở `apps/gateway/src/services/assessment/`; không thuật toán ngoài A1–A8 (không forced alignment).
- Mọi chuỗi UI vi + en qua `i18n.ts` của package/MFE; nội dung học giữ tiếng Việt.
- Test dùng provider giả; không gọi Gemini thật trong test; TTS chỉ bật khi `TTS_PROVIDER=gemini` (không theo sự có mặt của khóa).
- Không đụng: `packages/state/src/sync.ts`, `progress.ts`, `gamification.ts`, gateway sync, `apps/mfe-conversation`, `routes/chat.ts`, kịch bản nhập vai, route chính sách riêng tư của Host. Sửa `app.ts`, `config.ts`, `routes.tsx`, `endpoints.ts` chỉ theo kiểu thêm.
- Không migration DB mới (cache giải thích ở RAM). Tệp âm thanh không commit (thư mục `apps/gateway/.data/` đã gitignore).
- Tải ban đầu ≤ 68.5 kB; chunk mới có mục trong `.size-limit.cjs`.
- e2e GĐ2 chạy cổng 4203 (preview) / 4030 (gateway).
- Không commit khối turbo tự chèn vào `AGENTS.md`.

## Review Focus
1. Câu có dấu câu/hoa thường/Unicode tổ hợp (NFD từ STT) → so khớp vẫn đúng (test `syllables`).
2. STT nghe đúng chữ nhưng sai thanh (“ma” thay “má”) → trạng thái `tone`, không phải `wrong`, có tên thanh (test assess).
3. Hết hạn mức TTS (429) hoặc STT kiểm lại bị 503 giữa chừng → script dừng êm, tệp đã tạo giữ `unverified`, lần chạy sau chỉ kiểm lại (test prebuild).
4. Người học từ chối micro / chưa đồng ý gửi giọng / mất mạng → luôn còn nút “Không nói được lúc này” (test SpeakExercise + e2e).
5. Từ đồng hình theo miền (“ngã”, “vào”) trong bài luyện thanh → không bị đổi (test `localizeText` + buildItem tone).

---

### Task 1: Contract `speech.ts` + năng lực STT + A3 thật

**Files:**
- Create: `packages/contracts/src/api/speech.ts`; Modify: `packages/contracts/src/api/index.ts`, `src/index.ts`, `src/api/endpoints.ts` (bỏ `AssessResponseSchema` cũ — chưa client nào dùng)
- Create: `apps/gateway/src/providers/stt.ts`, `apps/gateway/src/services/assessment/{text,align,segments,assess}.ts`
- Modify: `apps/gateway/src/app.ts` (thêm `stt` vào `RouteDeps`/`BuildOptions`), `routes/speech.ts`, `packages/audio-dsp/src/audio/wav.ts` (+`decodeWavPcm`)
- Test: `apps/gateway/test/assessment.test.mjs`, `packages/contracts/test/speech.test.mjs`

**Interfaces (Produces):**
- `ToneIdSchema`, `AssessWordSchema {expected: string|null, heard: string|null, status: 'correct'|'tone'|'wrong'|'missing'|'extra', expectedTone?, heardTone?, pitch?: {score: 0..100, bestMatch: ToneId}}`
- `AssessResponseSchema {transcript, words: AssessWord[], score: 0..100, toneChecked: boolean, mock: boolean, hints: string[]}`
- `SttProvider { name; transcribe(a:{bytes:Buffer;mimetype:string}): Promise<{text:string;confidence:number;tokens:number}> }`, `createSttProvider(llm: LlmProvider|null): SttProvider|null`
- `syllables(text): string[]`, `toneOf(s): ToneId`, `baseOf(s): string`, `alignSyllables(exp: string[], heard: string[]): {expected: string|null; heard: string|null}[]`, `syllableContours(pcm: Float32Array, sampleRate: number): number[][]`, `assessPronunciation({expectedText, transcript: string|null, pcm: Float32Array|null, sampleRate}): AssessResult`
- `decodeWavPcm(bytes: Uint8Array): {pcm: Float32Array; sampleRate: number} | null`

Quyết định:
- Đơn vị so khớp = âm tiết (tiếng Việt viết tách âm tiết). Chuẩn hóa: NFC, `toLocaleLowerCase('vi')`, bỏ dấu câu (`/[^\p{L}\p{N}\s]/gu`).
- Thanh từ dấu: NFD, dấu `̀` huyền, `́` sắc, `̉` hỏi, `̃` ngã, `̣` nặng; không có = ngang. `baseOf` bỏ đúng 5 dấu này (giữ â ă ơ ư ê ô đ).
- Căn chỉnh Levenshtein: thay thế cùng âm tiết = 0, cùng `baseOf` khác thanh = 0.4, khác = 1; chèn/xóa = 1. Cặp → trạng thái correct/tone/wrong/missing/extra.
- Điểm = round(100 × (correct + 0.5·tone) / số âm tiết mong đợi) − 5 × extra, kẹp 0..100.
- A2 từng âm tiết chỉ khi `syllableContours` trả đúng bằng số âm tiết mong đợi (đoạn hữu thanh tách bởi ≥ 80 ms vô thanh, bỏ đoạn < 60 ms): `compareContours` với thanh mong đợi + chọn `bestMatch` trong 6 thanh → `pitch`. Không khớp số đoạn ⇒ `toneChecked=false`, không phán thanh. Trạng thái đúng/sai do chữ quyết định, không do pitch.
- STT KHÔNG nhận `expectedText` (tránh nghe theo đáp án).
- Không có STT (mock, e2e): `transcript=''`, `mock=true`, mọi từ `status:'correct'`? — KHÔNG: mock trả mọi từ `correct` sẽ là điểm giả. Chọn: `mock=true`, `transcript=''`, `words` = âm tiết mong đợi với `status:'correct'` chỉ để hiển thị trung tính, `score=0`, `hints=['mock']`; client coi mock là “bỏ qua, không tính” và hiện ghi chú “chưa nối nhận dạng giọng nói”. Điều này cố định để e2e kiểm.
- `expectedText` bắt buộc cho `/speech/assess` (400 `missing_expected_text`).

- [ ] Viết test node `assessment.test.mjs`: `syllables('Xin chào, bạn!')` = `['xin','chào','bạn']`; NFD đầu vào cho cùng kết quả; `toneOf('má')='sac'`, `toneOf('mạ')='nang'`, `toneOf('ma')='ngang'`, `baseOf('mả')='ma'`, `baseOf('ướt')='ươt'`; assess `('Tôi tên là Lan', 'tôi tên la lan lắm')` → statuses `correct,correct,tone(expectedTone huyen, heardTone ngang),correct,extra`; thiếu từ → `missing`; sai hẳn → `wrong`; score trong khoảng; route với `stt` giả (inject qua `buildApp(..., { stt })`) trả 200 đúng contract; không `stt` → `mock:true`; thiếu `expectedText` → 400; `syllableContours` trên 2 đoạn sóng răng cưa tách 150 ms lặng → 2 contour.
- [ ] Chạy `pnpm --filter @vietlearning/gateway build && node --test test/assessment.test.mjs` → FAIL.
- [ ] Cài đặt theo Interfaces; `respond(AssessResponseSchema, …)`.
- [ ] Chạy lại → PASS; `pnpm --filter @vietlearning/gateway test` toàn bộ PASS (sửa `audio-upload.test.mjs` nếu đổi hình dạng).
- [ ] Commit `feat(a3): chấm phát âm câu thật — so khớp âm tiết NFC + A2 từng âm tiết`.

### Task 2: Dạng bài “nói lại câu” trong lộ trình

**Files:**
- Modify: `packages/content/src/course/course.ts` (`ExerciseRef` + `{type:'speak'; sentence}`), `data/course/unit-{1,2,3}.json` (≥ 1 bài speak/unit), `packages/content/test/course.test.mjs`
- Create: `packages/exercises/src/speak/{SpeakExercise.tsx,useSentenceRecorder.ts,assessClient.ts,grade.ts,grade.test.ts,SpeakExercise.test.tsx}`
- Modify: `packages/exercises/src/{types.ts,build.ts,ExerciseView.tsx,i18n.ts,index.ts}`, `package.json` (+`@vietlearning/api-client`), `apps/mfe-path/src/session/SessionRunner.tsx` (`SKILL.speak='pronunciation'`)
- Test: e2e `apps/host-shell/e2e/gd2.spec.ts`

**Interfaces:**
- Consumes: `AssessResponseSchema` (Task 1).
- Produces: item `{kind:'speak'; key; prompt; text; translation}`; `refKey` `speak:<sentenceId>`; `gradeAssess(r: AssessResponse): {correct:boolean; skipped:boolean; quality:number; score:number}` (mock ⇒ skipped; score ≥ 70 ⇒ correct; quality 5/4/3/1 cho ≥90/≥80/≥70/<70).

Quyết định: ghi tối đa 8 s (`MAX_SENTENCE_MS=8000`), WAV 16 kHz qua `encodeWav`, gửi `expectedText` = câu theo thứ tự accepted[0]. Lần đầu bấm micro: hỏi đồng ý `consents.voice` (cùng khóa với M1). Màu: correct xanh (`text-heading`), tone vàng (`bg-warning-soft`/token có sẵn), wrong đỏ, missing gạch ngang xám, extra liệt kê “bạn nói thêm”. Mỗi từ có `aria-label` (“chào: sai thanh — cần thanh huyền, bạn nói thanh ngang”). Nút: “Nghe mẫu”, micro, “Thử lại”, “Tiếp →”, “Không nói được lúc này” (en “Can’t speak now”) luôn hiện khi chưa có kết quả.

- [ ] Test vitest `grade.test.ts` (ngưỡng trên) + `SpeakExercise.test.tsx` (kết quả giả: từ tone có nhãn đúng; mock hiện ghi chú và “Tiếp” trả `skipped:true`; nút bỏ qua gọi `onSkip`); test content: mọi ref `speak` trỏ câu có thật.
- [ ] Chạy → FAIL; cài đặt; chạy → PASS.
- [ ] e2e `gd2.spec.ts` “nói lại câu”: micro giả lập (2 cụm sóng), `/bai-hoc/<bài có speak>` tới bài speak → ghi → thấy ghi chú mock; rồi `page.route('**/v1/speech/assess')` trả kết quả có `tone`/`wrong`/`missing`/`extra` → kiểm màu/nhãn và danh sách “thanh lệch”; micro bị từ chối → còn nút bỏ qua.
- [ ] Commit `feat(exercises): dạng bài nói lại câu (A3) tô màu từng từ`.

### Task 3: TTS theo miền + dựng sẵn + phát offline

**Files:**
- Create: `apps/gateway/src/providers/tts.ts`, `src/services/tts/{audioStore,prebuild}.ts`, `apps/gateway/scripts/prebuild-tts.ts`, `src/routes/audio.ts`
- Create: `packages/content/src/course/speakable.ts` (+ export), `packages/content/test/speakable.test.mjs`
- Modify: `apps/gateway/src/config.ts` (thêm `TTS_PROVIDER` none|gemini mặc định none, `GEMINI_TTS_MODEL` mặc định `gemini-3.8-flash-tts`, `GEMINI_TTS_VOICE` mặc định `Kore`, `TTS_AUDIO_DIR` mặc định `apps/gateway/.data/tts`, `PUBLIC_BASE_URL` tùy chọn), `cache/TTSCacheProxy.ts`, `app.ts`, `routes/speech.ts` (`/speech/synthesize`), `contracts/api/speech.ts` (`AudioPackSchema`), `package.json` gateway (`"tts:prebuild": "tsx scripts/prebuild-tts.ts"`)
- Create: `packages/exercises/src/audio/coursePlayer.ts` (+test); Modify `choice/ChoiceExercise.tsx` (`say` dùng player), `apps/mfe-path/src/LessonScreen.tsx` (tải gói unit khi mở bài)
- Test: `apps/gateway/test/tts.test.mjs`

**Interfaces:**
- `TtsProvider { name; model; voice; promptVersion; synthesize({text, dialect}): Promise<{wav: Buffer}> }`; `directorPrompt(text, dialect): string` (AUDIO PROFILE / DIRECTOR'S NOTES / “Read ONLY the transcript, word for word…” / TRANSCRIPT); lỗi 429 ⇒ `GatewayError(429,'tts_quota_exhausted')`; PCM `audio/L16;rate=N` ⇒ bọc WAV (`pcm16ToWav(bytes, rate)` trong audio-dsp); `createTtsProvider(config)` null nếu `TTS_PROVIDER!=='gemini'` hoặc thiếu khóa.
- `ttsCacheKey` thêm `model` + `promptVersion` vào chuỗi băm (voiceId = tên giọng provider).
- `FileAudioStore(dir)`: `has(key)`, `write(key, wav)`, `read(key)`, `readJson/writeJson(name)`; tệp `<key>.wav`, gói `packs/<pack>-<dialect>.json`, trạng thái `state/<pack>-<dialect>.json`.
- `AudioPackSchema {version:1, pack, dialect, model, voice, items: Record<textNFC, key64hex>}`.
- `speakableTexts(pack: string /* unit id hoặc 'tones' */, dialect): string[]` — từ (meaning/listen), câu (build/fill/speak theo accepted[0]), từ luyện thanh, đã `localizeText` theo miền (Task 5 dùng chung), bỏ trùng NFC.
- `runPrebuild({pack, dialect, texts, tts, stt, store, maxTries=2, limit?}): Promise<{ok, rejected, unverified, skipped, quotaStopped: boolean}>` — trạng thái mỗi text `ok|rejected|unverified` + `heard` + `tries`; đã ok ⇒ bỏ qua; unverified ⇒ chỉ kiểm lại; rejected và tries < maxTries ⇒ tổng hợp lại; TTS 429 ⇒ dừng; STT lỗi (503/429) ⇒ để `unverified`, dừng; kiểm lại = `syllables(heard)` khớp hoàn toàn `syllables(text)`; luôn ghi lại manifest chỉ gồm `ok`.
- Route công khai `GET /audio/:name` (ngoài `/v1`, không auth): `^[a-f0-9]{64}\.wav$` hoặc `^packs/…` qua `GET /audio/packs/:pack` với `^[\w-]{1,40}-(north|central|south)\.json$`; cache-control immutable cho wav.
- Client `coursePlayer`: `prefetchPack(pack, dialect): Promise<number>` (tải manifest + wav vào Cache Storage `becutit-audio-v1`, lỗi mạng im lặng), `playText(text): Promise<void>` (tra manifest theo miền đang chọn → `HTMLAudioElement`; không có ⇒ `getDeviceSpeech().speak`).

- [ ] Test `tts.test.mjs`: `directorPrompt` chứa accent đúng miền và TRANSCRIPT tách riêng; provider với `fetch` giả trả L16 ⇒ WAV hợp lệ (`readWavInfo`); 429 ⇒ `tts_quota_exhausted`; `runPrebuild` với tts/stt giả: lần 1 tạo 3 ok + 1 rejected (stt nghe thêm từ); lần 2 bỏ qua ok; tts ném 429 ở text thứ 2 ⇒ `quotaStopped`, text đầu ok; stt ném 503 ⇒ `unverified`, lần sau chỉ kiểm lại (tts không được gọi); manifest chỉ có ok; route `/audio/<key>.wav` 200 + từ chối `../`; `/v1/speech/synthesize` không provider ⇒ 503, có provider giả ⇒ `audioUrl` tuyệt đối.
- [ ] Test `speakable.test.mjs`: `speakableTexts('u1','north')` chứa “xin chào” và câu cs1 “Chào chị ạ”, không trùng; miền Nam đổi đúng từ có trong A7.
- [ ] FAIL → cài đặt → PASS. Commit `feat(tts): giọng theo miền (D9) — provider, cache theo hash, script dựng sẵn có kiểm lại bằng STT`.
- [ ] Chạy thật: `pnpm --filter @vietlearning/gateway tts:prebuild --pack u1 --dialect south` (TTS_PROVIDER=gemini chỉ trong lệnh này); ghi số ok/rejected/unverified vào nhật ký.
- [ ] Client player + test (mock `caches`, `fetch`); commit `feat(exercises): phát âm thanh dựng sẵn theo miền, lưu offline, fallback TTS máy`.

### Task 4: Phòng tập thanh điệu

**Files:**
- Create: `packages/content/src/data/toneSets.json` + `src/pitch/toneSets.ts` (export `TONE_SETS`), `apps/mfe-speech-lab/src/gym/{toneGymModel.ts,toneGymModel.test.ts,gymStore.ts,ToneGymScreen.tsx,MinimalPairs.tsx,CatchTone.tsx,ToneProgress.tsx}`, `apps/host-shell/src/screens/ToneGymRoute.tsx`
- Modify: `apps/mfe-speech-lab/src/{index.ts,i18n.ts}`, host `routes.tsx` (+`/phong-thanh`), `screens/Explore.tsx`/`exploreI18n.ts` (thêm ô), `.size-limit.cjs`
- Test: e2e trong `gd2.spec.ts`

**Interfaces:**
- `TONE_SETS: {id, base, forms: Partial<Record<ToneId,{vi:string; en:string}>>, reviewed:false}[]` (≥ 8 bộ, chỉ từ có thật).
- `minimalPairQuestion(seed): {set, options: ToneId[] (2–3), answer: ToneId, word}`; `catchToneRound(seed, n=10): {word, tone}[]`; `nextTimeLimit(ms, correct): number` (đúng ×0.85, sai ×1.15, kẹp 1500..6000, bắt đầu 5000); `toneProgress(toneStats, gym): {tone, speakAvg|null, listenRate|null, trend: number[] (7 ngày)}[]`.
- `gymStore` (persist `becutit.toneGym`, `safeStorage`): `record(tone, correct, now)`; dữ liệu `byDay: Record<dayKey, Record<ToneId,{n,c}>>` giữ 30 ngày.
- Không cần âm thanh để hoàn thành: chữ hiện sau khi bấm “Nghe” lỗi; mọi câu trả lời được bằng nút; e2e chạy bằng seed cố định qua `?seed=`.

- [ ] Test model (seed xác định, đáp án thuộc options, options khác nhau, thời gian kẹp, trend 7 phần tử). FAIL → cài → PASS.
- [ ] Màn hình 3 tab; e2e: `/phong-thanh` → làm 1 câu cặp tối thiểu, chơi “bắt thanh” 10 câu, tab Tiến bộ hiện 6 thanh, bố cục 320 px.
- [ ] Commit `feat(speech-lab): phòng tập thanh điệu`.

### Task 5: Chế độ miền trong bài học + thẻ “miền khác nói thế nào”

**Files:**
- Modify: `packages/content/src/dialects/dialectMap.ts` (+`localizeText(text, dialect): string`, thay nguyên token khớp chính xác dạng Bắc của mục `reviewed:true`, giữ hoa đầu câu), `course.ts` (`Unit.dialectNotes?: string[]`), `unit-*.json`, `packages/exercises/src/build.ts` (localize hiển thị/đáp án của meaning/listen/fill/build; KHÔNG tone; `refKey` không đổi), `apps/mfe-path/src/PathHome.tsx` + `DialectCard.tsx`
- Test: `packages/content/test/dialect.test.mjs`, `packages/exercises/src/build.test.ts`

Quyết định: dạng bài build đổi `text` từng token qua `localizeText`; accepted giữ nguyên. Thẻ miền: mỗi unit liệt kê mục d* (Bắc/Trung/Nam) với nút nghe từng miền (player Task 3, gói `dialect-<miền>`... dùng `playText` + miền của thẻ).

- [ ] Test: `localizeText('Tôi ăn dứa','south')='Tôi ăn thơm'`; không đổi khi miền Bắc; không đổi khi chỉ khớp một phần (“dứa” trong “dứaa”); buildItem tone giữ “ngã”; buildItem meaning miền Nam với từ có trong A7 hiện dạng Nam, refKey như cũ. FAIL → cài → PASS.
- [ ] Commit `feat(path): chế độ miền (A7) + thẻ miền khác nói thế nào`.

### Task 6: Giải thích câu trả lời bằng LLM

**Files:**
- Modify: `packages/contracts/src/api/speech.ts` (+`ExplainRequestSchema {kind:'choice'|'build'|'speak'|'tone', question ≤300, answer ≤200, userAnswer ≤200, language vi|en}`, `ExplainResponseSchema {explanation ≤800, tip? ≤300, mock, cached}`), `packages/prompts/src/index.ts` (+`EXPLAIN_PROMPT_VERSION`, `explainAnswerPrompt(language)`), `apps/gateway/src/routes/practice.ts` (`POST /v1/practice/explain`)
- Create: `apps/gateway/src/services/explain/explain.ts` (`ExplainCache` LRU 500 theo sha256 của request + version; `explainAnswer(llm, req)` Zod; mock theo mẫu), `packages/exercises/src/explain/ExplainButton.tsx` (lazy, chỉ hiện khi sai)
- Test: `apps/gateway/test/explain.test.mjs`, `packages/exercises/src/explain/ExplainButton.test.tsx`

- [ ] Test: mock không khóa ⇒ `mock:true` và có đáp án trong lời giải; llm giả đếm số lần gọi: cùng request 2 lần ⇒ gọi 1 lần, lần 2 `cached:true`; llm trả JSON sai schema ⇒ 502 `llm_bad_output`; trừ quota llm. UI: bấm “Giải thích thêm” ⇒ hiện chữ thuần (không HTML). FAIL → cài → PASS.
- [ ] Commit `feat(explain): giải thích câu trả lời bằng LLM (JSON + Zod, cache theo câu)`.

### Task 7: Kiểm tra cuối + nhật ký + push
- [ ] `pnpm build`, `pnpm test`, `pnpm lint:boundaries`, `pnpm --filter @vietlearning/host-shell size` PASS (ghi số).
- [ ] e2e: `VITE_GATEWAY_URL=http://localhost:4030 pnpm --filter @vietlearning/host-shell build`, `E2E_PORT=4203 E2E_GATEWAY_PORT=4030 pnpm --filter @vietlearning/host-shell e2e` PASS (cả path.spec cũ).
- [ ] `docs/nhat-ky/GD2.md` đủ: việc đã làm, số test, kết quả script, quyết định cần người (trả phí Gemini, nghe duyệt giọng, commit âm thanh hay object storage).
- [ ] Ghi chú cho các phiên song song (danh sách tệp đã sửa) trong thư mục ghi chú chung; `git push -u origin claude/gd2-ky-nang-viet-6eb955`.
