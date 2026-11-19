import { expect, type Page } from '@playwright/test';

/** Giải một bài học như người học thật — dùng chung cho path.spec.ts và progress-sync.spec.ts */
export interface Strings {
  summary: RegExp;
  answer: RegExp;
  correctOrder: RegExp;
  next: string;
  check: string;
  wordBank: string;
  choices: string;
  skip: RegExp;
}
export const VI: Strings = {
  summary: /^Xong bài/,
  answer: /Đáp án: “([^”]+)”/,
  correctOrder: /Câu đúng: “([^”]+)”/,
  next: 'Tiếp →',
  check: 'Kiểm tra',
  wordBank: 'Các từ để ghép',
  choices: 'Lựa chọn',
  skip: /Không (nghe|nói) được lúc này/
};
export const EN: Strings = {
  summary: /complete!$/,
  answer: /Answer: “([^”]+)”/,
  correctOrder: /Correct sentence: “([^”]+)”/,
  next: 'Next →',
  check: 'Check',
  wordBank: 'Words to use',
  choices: 'Choices',
  skip: /Can’t (listen|speak) now/
};

/**
 * Làm hết một bài như người học “chăm nhưng chưa biết gì”: lần đầu chọn đại; sai thì nhớ đáp án hiện ra
 * trong phản hồi, câu đó quay lại cuối phiên thì chọn đúng. Bài nghe/nói bấm “không nghe/nói được lúc này”.
 * Trả về số câu đã trả lời. `onItem` để kiểm tra bố cục giữa bài.
 */
export async function solveLesson(page: Page, s: Strings, memory = new Map<string, string>(), onItem?: () => Promise<void>) {
  const summary = page.getByRole('heading', { level: 1, name: s.summary });
  let answered = 0;
  for (let guard = 0; guard < 40; guard++) {
    const q = page.locator('#ct-ex-q');
    await expect(summary.or(q)).toBeVisible();
    if (await summary.isVisible()) return answered;
    const section = page.locator('section[aria-labelledby="ct-ex-q"]');
    // Bài nói/thanh/truyện tải lười (Suspense, khung chờ aria-busy): chờ hiện xong rồi mới xem có nút nào —
    // isVisible() không chờ, trên CI chunk tải chậm thì lỡ nút đọc câu hoặc bấm nhầm “Không nói được” (xem nhật ký CI-CD)
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);
    const key = (await section.locator('#ct-ex-q').textContent()) + '|' + ((await section.locator('p[lang="vi"]').first().textContent({ timeout: 50 }).catch(() => '')) ?? '');
    if (onItem) await onItem();

    const skip = section.getByRole('button', { name: s.skip });
    if (await skip.isVisible()) {
      await skip.click();
    } else if (await section.getByRole('group', { name: s.wordBank }).isVisible()) {
      const bank = section.getByRole('group', { name: s.wordBank });
      const known = memory.get(key);
      if (known) {
        // token có thể nhiều chữ (vd. "bao nhiêu tiền"): ghép tham lam theo nút có trong kho từ
        const labels = (await bank.getByRole('button').allTextContents()).map((x) => x.trim());
        let rest = known;
        while (rest.length) {
          const tok = labels.filter((l) => rest === l || rest.startsWith(l + ' ')).sort((a, b) => b.length - a.length)[0];
          await bank.getByRole('button', { name: tok, exact: true }).click();
          rest = rest.slice(tok.length).trim();
        }
      } else {
        const n = await bank.getByRole('button').count();
        for (let i = 0; i < n; i++) await bank.getByRole('button').nth(i).click();
      }
      await section.getByRole('button', { name: s.check }).click();
      const fb = (await section.getByRole('status').textContent()) ?? '';
      const m = fb.match(s.correctOrder);
      if (m) memory.set(key, m[1]);
      await section.getByRole('button', { name: s.next }).click();
    } else {
      const group = section.getByRole('group', { name: s.choices });
      const known = memory.get(key);
      if (known) await group.getByRole('button', { name: known, exact: true }).click();
      else await group.getByRole('button').first().click();
      const fb = (await section.getByRole('status').textContent()) ?? '';
      const m = fb.match(s.answer);
      if (m) memory.set(key, m[1]);
      await section.getByRole('button', { name: s.next }).click();
    }
    answered++;
  }
  throw new Error('bài học không kết thúc');
}
