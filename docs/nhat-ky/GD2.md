# Nhật ký GĐ2 — Kỹ năng đặc thù tiếng Việt

> Nhánh `claude/gd2-ky-nang-viet-6eb955` (dựng trên `fa16cd9`). Plan: `docs/superpowers/plans/2026-11-18-gd2-ky-nang-viet.md`.
> Kế hoạch tổng: `docs/KE_HOACH_PHAT_TRIEN_TOAN_DIEN.md` mục 5 (GĐ2), R5, D9. Mức bằng chứng: 🟢 đã chạy · 🔵 đọc code.

## 0. Baseline trước khi sửa (2026-11-18) 🟢
`pnpm install --frozen-lockfile` OK · `pnpm build` 19/19 task · `pnpm test` 35/35 task.

## 1. Tiến độ (dừng giữa chừng vì hết hạn mức sử dụng của phiên — 2026-11-18)
| Việc | Trạng thái | Commit |
|---|---|---|
| Contract `api/speech.ts` (Assess, AudioPack, Explain) | ✅ 🟢 | `2b36032` |
| A3 thật: `services/assessment/` (âm tiết NFC, Levenshtein có chi phí sai-thanh 0.4, A2 từng âm tiết khi số đoạn hữu thanh = số âm tiết), năng lực `stt` | ✅ 🟢 | `2b36032` |
| Nội dung: bài `speak` mỗi unit (không ở bài 1), `dialectNotes`, `localizeText` (A7, bỏ mục đồng hình d4 d8 d16 d18 d25 d29), `speakableTexts` | ✅ 🟢 | `8420d0b` |
| TTS theo miền: `providers/tts.ts` (director's notes, chỉ bật khi `TTS_PROVIDER=gemini`), `FileAudioStore`, `runPrebuild` (ok/rejected/unverified, dừng êm khi 429/STT lỗi), route công khai `/audio/*`, `/v1/speech/synthesize` dùng tệp dựng sẵn | ✅ 🟢 (64/64 test gateway) | commit kế |
| CLI `scripts/prebuild-tts.ts` + chạy thật unit 1 miền Nam | ⬜ chưa làm | |
| UI “nói lại câu” (`packages/exercises/src/speak/`), player gói âm thanh offline | ⬜ | |
| Phòng tập thanh, chế độ miền trong `buildItem` + thẻ miền, giải thích LLM | ⬜ | |
| e2e (4203/4030), size-limit, lint:boundaries, push cuối | ⬜ | |

Lưu ý: sửa JSON trong `packages/content` thì `tsc -b` không tự chép lại vào `dist` — chạy `pnpm exec tsc -b --force` trong package đó.
Âm thanh lưu ở `apps/gateway/.data/tts` (gitignored) — chưa quyết commit/object storage.
Khi bật TTS, M1/M7 (`routes/chat.ts`, phiên GĐ3) sẽ nhận `audioUrl` tương đối `/audio/...` — cần tiền tố gốc URL như `/speech/synthesize`.
