import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
});

describe('Privacy policy (en) by AI provider', () => {
  it('lists Google (Gemini), Groq, OpenRouter, data types and possible use to improve their services', async () => {
    const { default: PrivacyRoute } = await import('./PrivacyRoute');
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PrivacyRoute />
      </MemoryRouter>
    );
    for (const s of ['Google (Gemini)', 'Groq', 'OpenRouter', 'text messages', 'voice', 'video-call frames', 'improve their services']) expect(html).toContain(s);
    expect(html).toContain('[To fill in');
  });
});
