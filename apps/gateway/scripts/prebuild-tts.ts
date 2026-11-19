/**
 * Dựng sẵn âm thanh khóa học theo miền (D9). Chạy:
 *   pnpm --filter @vietlearning/gateway tts:prebuild -- [--pack u1|all] [--dialect south|all] [--max-tries 4] [--limit N]
 *   pnpm --filter @vietlearning/gateway tts:prebuild -- --approve --pack u1 --dialect central [--reject "câu 1" --reject "câu 2"]
 *
 * --provider local (mặc định): máy chủ `tools/tts-local` (VieNeu-TTS + faster-whisper chạy trên máy, miễn phí) ở TTS_BASE_URL.
 * --provider gemini: Gemini TTS + Gemini STT (cần khóa trong ~/.becutit/gateway.env; gói miễn phí chỉ 10 lần/ngày).
 *
 * Bắc/Nam: STT phải chép ra ĐÚNG nguyên văn mới vào manifest. Trung: STT nghe thanh Huế kém => tệp ở trạng thái
 * “chờ nghe”, script ghi trang nghe `review/<gói>-central.html`; người nghe duyệt rồi chạy `--approve`.
 * Chạy lại nhiều lần an toàn: bỏ qua tệp đạt/chờ nghe, chỉ kiểm lại tệp chưa kiểm.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COURSE, speakableTexts, type Dialect } from '@vietlearning/content';
import { loadConfig } from '../src/config.js';
import { GeminiProvider } from '../src/providers/llm.js';
import { OpenAiCompatSttProvider, createSttProvider, type SttProvider } from '../src/providers/stt.js';
import { createTtsProvider } from '../src/providers/tts.js';
import { FileAudioStore } from '../src/services/tts/audioStore.js';
import { approveReviewed, runPrebuild, type StateEntry } from '../src/services/tts/prebuild.js';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const args = (name: string) => process.argv.flatMap((a, i) => (a === `--${name}` && process.argv[i + 1] ? [process.argv[i + 1]] : []));
const flag = (name: string) => process.argv.includes(`--${name}`);

const DIALECTS: Dialect[] = ['north', 'central', 'south'];
const ALL_PACKS = [...COURSE.units.map((u) => u.id), 'tones'];
const packArg = arg('pack', 'all')!;
const dialectArg = arg('dialect', 'all')!;
const packs = packArg === 'all' ? ALL_PACKS : [packArg];
const dialects = dialectArg === 'all' ? DIALECTS : [dialectArg as Dialect];
if (!dialects.every((d) => DIALECTS.includes(d))) throw new Error('--dialect phải là north | central | south | all');
const limit = arg('limit') ? Number(arg('limit')) : undefined;
const maxTries = Number(arg('max-tries', '4'));
const provider = arg('provider', 'local');

const config = loadConfig({ ...process.env, TTS_PROVIDER: provider === 'gemini' ? 'gemini' : 'openai-compatible' });
const store = new FileAudioStore(config.TTS_AUDIO_DIR);

if (flag('approve')) {
  // --reject-file: JSON {"u1-central": ["câu sai", ...]} copy từ trang nghe duyệt; hoặc --reject "câu" (lặp lại được)
  const rf = arg('reject-file');
  const fromFile: Record<string, string[]> = rf ? JSON.parse(await readFile(rf, 'utf8')) : {};
  for (const pack of packs)
    for (const d of dialects) {
      const r = await approveReviewed(store, pack, d, [...args('reject'), ...(fromFile[`${pack}-${d}`] ?? [])]);
      console.log(`Duyệt ${pack}-${d}: đạt ${r.approved}, loại ${r.rejected} (chạy lại không có --approve để ghi manifest / tạo lại câu bị loại)`);
    }
  process.exit(0);
}

const tts = createTtsProvider(config);
let stt: SttProvider | null;
if (provider === 'gemini') {
  // Kiểm lại chạy ngoài luồng người dùng: cho STT 30 giây (LLM_TIMEOUT_MS ≤ 9 s là giới hạn cho request của app)
  stt = config.GEMINI_API_KEY ? createSttProvider(new GeminiProvider(config.GEMINI_API_KEY, config.GEMINI_MODEL, 30_000)) : null;
} else {
  stt = new OpenAiCompatSttProvider(config.TTS_BASE_URL);
  try {
    await fetch(config.TTS_BASE_URL.replace(/\/v1\/?$/, '') + '/health', { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(`Không gọi được máy chủ local ở ${config.TTS_BASE_URL}. Chạy trước: %USERPROFILE%/.becutit/tts/Scripts/python.exe -X utf8 tools/tts-local/server.py`);
    process.exit(2);
  }
}
if (!tts || !stt) {
  console.error('Thiếu cấu hình TTS/STT (provider gemini cần GEMINI_API_KEY trong ~/.becutit/gateway.env).');
  process.exit(2);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const DIALECT_VI: Record<Dialect, string> = { north: 'Bắc', central: 'Trung', south: 'Nam' };

/**
 * MỘT trang nghe duyệt cho mọi tệp “chờ nghe” của mọi gói × miền (mở thẳng từ đĩa; âm thanh ở thư mục cha).
 * Người nghe đánh dấu câu đọc sai => trang hiện JSON để dán vào `review/rejects.json`, rồi chạy `--approve`.
 */
async function writeReviewPage(): Promise<{ file: string; count: number }> {
  const rows: { id: string; key: string; s: StateEntry }[] = [];
  for (const d of DIALECTS)
    for (const pack of ALL_PACKS) {
      const state = (await store.readJson<Record<string, StateEntry>>(`state/${pack}-${d}.json`)) ?? {};
      // chỉ câu còn trong khóa học (câu đã bỏ/sửa khi duyệt nội dung không cần nghe nữa)
      const current = new Set(speakableTexts(pack, d).map((t) => t.normalize('NFC').trim()));
      for (const [key, s] of Object.entries(state)) if (s.status === 'review' && current.has(s.text)) rows.push({ id: `${pack}-${d}`, key, s });
    }
  const groups = [...new Set(rows.map((r) => r.id))];
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nghe duyệt âm thanh</title>
<style>body{font:16px system-ui;margin:16px;max-width:820px}h2{margin-top:28px}li{margin:6px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
li.on{background:#fff3c4}b{min-width:150px}small{color:#666}label{cursor:pointer}textarea{width:100%;height:140px}
.bar{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd}</style>
<h1>Nghe duyệt âm thanh dựng sẵn (${rows.length} tệp)</h1>
<p>Bấm ▶ để nghe từng câu, hoặc “Phát lần lượt” để nghe hết một nhóm. Câu nào <b>đọc sai chữ hoặc sai thanh</b> thì tích “sai”.
Xong thì copy khung JSON cuối trang gửi lại. Câu không tích = đạt. Dòng “STT” chỉ để tham khảo, Whisper hay nghe sai từ đơn.</p>
<div class="bar"><button id="stop">⏹ Dừng</button> <span id="now"></span></div>
${groups
  .map((g) => {
    const [pack, d] = [g.slice(0, g.lastIndexOf('-')), g.slice(g.lastIndexOf('-') + 1) as Dialect];
    const items = rows.filter((r) => r.id === g);
    return `<h2>${esc(pack)} · miền ${DIALECT_VI[d]} · giọng ${esc(tts!.voiceFor?.(d) ?? '')} (${items.length}) <button data-play="${g}">▶ Phát lần lượt</button></h2><ol>${items
      .map(
        (r) =>
          `<li data-g="${g}"><audio controls preload="none" src="../${r.key}.wav"></audio><b>${esc(r.s.text)}</b><label><input type="checkbox" data-g="${g}" data-t="${esc(r.s.text)}"> sai</label><small>STT: ${esc(r.s.heard ?? '—')}</small></li>`
      )
      .join('')}</ol>`;
  })
  .join('\n')}
<h2>Kết quả gửi lại</h2><textarea id="out" readonly>{}</textarea>
<script>
const out=document.getElementById('out');
function update(){const o={};document.querySelectorAll('input[type=checkbox]:checked').forEach(c=>{(o[c.dataset.g]??=[]).push(c.dataset.t)});out.value=JSON.stringify(o,null,1);}
document.addEventListener('change',update);
let stop=false;
document.getElementById('stop').onclick=()=>{stop=true;document.querySelectorAll('audio').forEach(a=>a.pause())};
document.querySelectorAll('[data-play]').forEach(b=>b.onclick=async()=>{stop=false;
 for(const li of document.querySelectorAll('li[data-g="'+b.dataset.play+'"]')){if(stop)break;
  li.classList.add('on');li.scrollIntoView({block:'center'});document.getElementById('now').textContent=li.querySelector('b').textContent;
  const a=li.querySelector('audio');a.currentTime=0;await a.play().catch(()=>{});
  await new Promise(r=>{a.onended=r;a.onpause=r});await new Promise(r=>setTimeout(r,700));li.classList.remove('on');}});
</script></html>`;
  const dir = join(store.dir, 'review');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'index.html');
  await writeFile(file, html, 'utf8');
  return { file, count: rows.length };
}

let stopped = false;
for (const pack of packs) {
  for (const dialect of dialects) {
    const texts = speakableTexts(pack, dialect);
    if (!texts.length) {
      console.error(`Gói "${pack}" không có văn bản nào.`);
      continue;
    }
    // mặc định duyệt tự động (quyết định 19/11); --human-review để bắt người nghe duyệt (cũ: miền Trung)
    const humanReview = flag('human-review');
    console.log(`\n== ${pack} · ${dialect} · ${texts.length} văn bản · TTS ${tts.model}/${tts.voiceFor?.(dialect) ?? tts.voice} · STT ${stt.name}${humanReview ? ' · chờ người nghe duyệt' : ''}`);
    const r = await runPrebuild({ pack, dialect, texts, tts, stt, store, maxTries, limit, humanReview, log: (l) => console.log('  ' + l) });
    console.log(
      `Kết quả ${pack}-${dialect}: đạt ${r.ok}/${r.total} · chờ nghe ${r.review} · loại ${r.rejected} · chưa kiểm ${r.unverified} · chưa tạo ${r.missing}` +
        ` · lần này tổng hợp ${r.synthesized}, kiểm ${r.verified}` +
        (r.stoppedBy ? ` · dừng vì ${r.stoppedBy}` : '')
    );
    for (const x of r.rejectedList) console.log(`  LOẠI “${x.text}” — nghe ra “${x.heard}”`);
    if (r.stoppedBy && r.stoppedBy !== 'limit') {
      stopped = true;
      break;
    }
  }
  if (stopped) break;
}
const review = await writeReviewPage();
console.log(`\nChờ người nghe: ${review.count} tệp — trang nghe duyệt: ${review.file}`);
console.log(`Thư mục âm thanh: ${config.TTS_AUDIO_DIR} (gitignored — chưa commit, chờ quyết định lưu trữ GĐ5)`);
