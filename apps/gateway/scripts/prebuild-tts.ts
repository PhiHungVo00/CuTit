/**
 * Dựng sẵn âm thanh khóa học theo miền (D9). Chạy:
 *   pnpm --filter @vietlearning/gateway tts:prebuild -- --pack u1 --dialect south [--limit 10] [--max-tries 2]
 * Bật TTS chỉ trong tiến trình này (TTS_PROVIDER=gemini), khóa đọc từ ~/.becutit/gateway.env như Gateway.
 * Chạy lại nhiều lần an toàn: bỏ qua tệp đạt, chỉ kiểm lại tệp chưa kiểm, dừng êm khi hết hạn mức ngày.
 */
import { speakableTexts, type Dialect } from '@vietlearning/content';
import { loadConfig } from '../src/config.js';
import { GeminiProvider } from '../src/providers/llm.js';
import { createSttProvider } from '../src/providers/stt.js';
import { createTtsProvider } from '../src/providers/tts.js';
import { FileAudioStore } from '../src/services/tts/audioStore.js';
import { runPrebuild } from '../src/services/tts/prebuild.js';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const pack = arg('pack', 'u1')!;
const dialect = arg('dialect', 'south') as Dialect;
if (!['north', 'central', 'south'].includes(dialect)) throw new Error('--dialect phải là north | central | south');
const limit = arg('limit') ? Number(arg('limit')) : undefined;
const maxTries = Number(arg('max-tries', '2'));

const config = loadConfig({ ...process.env, TTS_PROVIDER: 'gemini' });
const tts = createTtsProvider(config);
// Kiểm lại chạy ngoài luồng người dùng: cho STT 30 giây (LLM_TIMEOUT_MS ≤ 9 s là giới hạn cho request của app)
const stt = config.GEMINI_API_KEY ? createSttProvider(new GeminiProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL, 30_000)) : null;
if (!tts || !stt) {
  console.error('Thiếu GEMINI_API_KEY (đặt trong ~/.becutit/gateway.env) — không chạy được.');
  process.exit(2);
}

const texts = speakableTexts(pack, dialect);
if (!texts.length) {
  console.error(`Gói "${pack}" không có văn bản nào.`);
  process.exit(2);
}
console.log(`Gói ${pack} · miền ${dialect} · ${texts.length} văn bản · TTS ${tts.model}/${tts.voice} · STT ${stt.name} · thư mục ${config.TTS_AUDIO_DIR}`);

const r = await runPrebuild({ pack, dialect, texts, tts, stt, store: new FileAudioStore(config.TTS_AUDIO_DIR), maxTries, limit, log: (l) => console.log('  ' + l) });
console.log(
  `\nKết quả: đạt ${r.ok}/${r.total} · loại ${r.rejected} · chưa kiểm ${r.unverified} · chưa tạo ${r.missing} · lần này tổng hợp ${r.synthesized}, kiểm ${r.verified}` +
    (r.stoppedBy ? ` · dừng vì ${r.stoppedBy}` : '')
);
for (const x of r.rejectedList) console.log(`  LOẠI “${x.text}” — nghe ra “${x.heard}”`);
