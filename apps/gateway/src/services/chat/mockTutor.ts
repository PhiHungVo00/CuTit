/**
 * GIA SƯ GIẢ LẬP (MOCK) — đứng thay LLM thật cho /v1/chat/turn khi chưa nối nhà cung cấp.
 *
 * Đây KHÔNG phải thuật toán sản phẩm (không thuộc danh mục A1–A8): chỉ là bộ luật tất định để
 * Frontend và test có dữ liệu đúng hình dạng contract. Khi nối LLM thật (Nguyên tắc 1, 4),
 * thay lớp này bằng adapter gọi LLM với prompt từ packages/prompts, yêu cầu đầu ra JSON
 * (reply, correction, blocks, completedTasks) và xác thực bằng Zod (Nguyên tắc 6).
 * Mọi phản hồi từ đây đều gắn `mock: true` để giao diện báo trung thực cho người học.
 */
import { foldVietnamese, type RoleplayScenario } from '@vietlearning/content';
import type { AgentUIBlock, ChatCorrection, ChatHistoryItem } from '@vietlearning/contracts';

export interface TutorInput {
  userText: string;
  history: ChatHistoryItem[];
  scenario?: RoleplayScenario;
  correctionLevel: 'gentle' | 'strict' | 'off';
  persona: string;
}

export interface TutorResult {
  reply: string;
  correction?: ChatCorrection;
  blocks: AgentUIBlock[];
  completedTasks: number[];
}

/** Từ/cụm hay bị gõ thiếu dấu => dạng đúng (bộ giả lập sửa lỗi chính tả dấu) */
const DIACRITIC_FIXES: [RegExp, string][] = [
  [/\bxin chao\b/gi, 'xin chào'],
  [/\bcam on\b/gi, 'cảm ơn'],
  [/\btam biet\b/gi, 'tạm biệt'],
  [/\bbao nhieu\b/gi, 'bao nhiêu'],
  [/\btoi ten la\b/gi, 'tôi tên là'],
  [/\btoi\b/gi, 'tôi'],
  [/\bban\b/gi, 'bạn'],
  [/\bkhoe\b/gi, 'khỏe'],
  [/\bkhong\b/gi, 'không'],
  [/\bduoc\b/gi, 'được'],
  [/\btien\b/gi, 'tiền'],
  [/\bpho\b/gi, 'phở']
];

/** Từ khóa (đã bỏ dấu) cho từng nhiệm vụ của 4 kịch bản — bộ chấm giả lập, LLM thật sẽ thay */
const TASK_KEYWORDS: Record<string, string[][]> = {
  sc1: [['chao'], ['bao nhieu', 'gia'], ['bot', 'giam', 're hon', '5.000', '5000', 'nam nghin'], ['cam on', 'tam biet']],
  sc2: [['chao'], ['duong', 'ho guom', 'di toi', 'di den'], ['re trai', 're phai', 'di thang', 'vang', 'da hieu', 'hieu roi'], ['cam on']],
  sc3: [['chao'], ['pho'], ['khong hanh', 'khong bo hanh', 'it hanh', 'bo hanh'], ['bao nhieu', 'tinh tien', 'thanh toan']],
  sc4: [['chao', 'ten la', 'toi ten'], ['tuoi', 'sinh nam'], ['nganh', 'hoc gi'], ['tra da', 'di uong', 'ca phe']]
};

/** Lời nhân vật trong kịch bản, gợi ý nhiệm vụ kế tiếp */
const NPC_NUDGE: Record<string, string[]> = {
  sc1: ['Chào cháu! Hôm nay cô có rau muống tươi lắm, cháu mua gì?', 'Mớ rau muống mười lăm nghìn, nải chuối hai mươi nghìn cháu ạ.', 'Thôi được, cô bớt cho cháu năm nghìn nhé!', 'Cảm ơn cháu, lần sau lại ghé cô nhé!'],
  sc2: ['Chào cháu, cháu cần gì thế?', 'Hồ Gươm à? Cháu đi thẳng phố này, đến ngã tư thì rẽ trái là thấy.', 'Đúng rồi, rẽ trái rồi đi thêm năm phút nữa.', 'Không có gì, cháu đi cẩn thận nhé!'],
  sc3: ['Chào em, em ăn gì?', 'Phở bò tái chín một bát nhé. Em có ăn hành không?', 'Được rồi, không hành. Em đợi chút nhé!', 'Bát phở năm mươi nghìn em ạ. Cảm ơn em!'],
  sc4: ['Chào bạn! Mình là Minh, bạn tên gì?', 'Mình sinh năm 2004. Còn bạn bao nhiêu tuổi?', 'Mình học ngành Công nghệ thông tin. Bạn học ngành gì?', 'Hay quá! Chiều nay đi uống trà đá với mình nhé!']
};

const hasVietnameseMarks = (s: string) => foldVietnamese(s) !== s.toLowerCase();

function correct(text: string, level: TutorInput['correctionLevel']): ChatCorrection | undefined {
  if (level === 'off') return undefined;
  let fixed = text;
  if (!hasVietnameseMarks(text)) for (const [re, rep] of DIACRITIC_FIXES) fixed = fixed.replace(re, rep);
  if (level === 'strict' && fixed.length > 0) fixed = fixed[0].toUpperCase() + fixed.slice(1);
  if (fixed === text) return undefined;
  return {
    original: text,
    corrected: fixed,
    explanation: fixed.toLowerCase() !== text.toLowerCase() ? 'Tiếng Việt cần đủ dấu thanh: thiếu dấu có thể đổi nghĩa của từ (vd. "ban" khác "bạn", "bán").' : 'Câu nên viết hoa chữ cái đầu.'
  };
}

function completedTasks(scenario: RoleplayScenario, userTexts: string[]): number[] {
  const rules = TASK_KEYWORDS[scenario.id] ?? [];
  const joined = userTexts.map(foldVietnamese);
  return rules.flatMap((kw, i) => (joined.some((t) => kw.some((k) => t.includes(k))) ? [i] : []));
}

function blocksFor(folded: string): AgentUIBlock[] {
  const blocks: AgentUIBlock[] = [];
  if (/\b(anh|chi|em|co|chu|bac|ong|ba)\b/.test(folded)) {
    blocks.push({ id: 'b-honorific', type: 'honorific_card', title: 'Xưng hô cho đúng', payload: { note: 'Chọn anh/chị/em theo tuổi và quan hệ. Xem ma trận xưng hô để luyện thêm.' } });
  }
  if (/\b(chao|xin chao)\b/.test(folded)) {
    blocks.push({ id: 'b-culture', type: 'culture_pill', title: 'Văn hóa chào hỏi', payload: { tip: 'Chào người lớn tuổi nên thêm "ạ" ở cuối câu, có thể khoanh tay và hơi cúi đầu.' } });
  }
  if (/(thanh dieu|phat am|dau sac|dau hoi|dau nga)/.test(folded)) {
    blocks.push({ id: 'b-pitch', type: 'pitch_visualizer', title: 'Luyện thanh điệu', payload: { note: 'Ghi âm và xem biểu đồ cao độ của 6 thanh.' } });
  }
  return blocks.slice(0, 4);
}

export function mockTutorTurn(input: TutorInput): TutorResult {
  const folded = foldVietnamese(input.userText);
  const correction = correct(input.userText, input.correctionLevel);
  const teacher = input.persona === 'co_giao';

  if (input.scenario) {
    const userTexts = [...input.history.filter((h) => h.role === 'user').map((h) => h.text), input.userText];
    const done = completedTasks(input.scenario, userTexts);
    const nudges = NPC_NUDGE[input.scenario.id] ?? [];
    const allDone = done.length === input.scenario.tasks.length;
    const nextIndex = input.scenario.tasks.findIndex((_, i) => !done.includes(i));
    const reply = allDone ? `${nudges.at(-1) ?? 'Cảm ơn bạn!'} (Bạn đã hoàn thành mọi nhiệm vụ!)` : (nudges[Math.max(0, nextIndex)] ?? 'Bạn nói lại được không?');
    return { reply, correction, blocks: [], completedTasks: done };
  }

  let reply: string;
  if (/\b(chao|xin chao|hello)\b/.test(folded)) reply = teacher ? 'Chào em. Hôm nay em muốn luyện chủ đề gì?' : 'Chào bạn! Mình là Bé Cu Tít đây. Hôm nay bạn khỏe không?';
  else if (/(khoe|tot|on)\b/.test(folded)) reply = teacher ? 'Tốt lắm. Em thử kể về một ngày của em nhé.' : 'Tuyệt quá! Bạn kể mình nghe hôm nay bạn đã làm gì nhé?';
  else if (/(cam on)/.test(folded)) reply = teacher ? 'Không có gì em.' : 'Không có gì đâu! Mình học tiếp nha?';
  else if (input.userText.includes('?')) reply = teacher ? 'Câu hỏi hay. Em thử tự trả lời bằng một câu ngắn trước nhé.' : 'Câu hỏi hay đó! Bạn đoán thử trước rồi mình cùng xem nhé.';
  else reply = teacher ? 'Cô hiểu rồi. Em nói thêm một câu nữa nhé.' : 'Mình hiểu rồi! Bạn nói thêm một chút nữa đi.';
  return { reply, correction, blocks: blocksFor(folded), completedTasks: [] };
}
