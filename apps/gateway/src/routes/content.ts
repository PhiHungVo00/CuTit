import { FastifyPluginAsync } from 'fastify';
import { CULTURE_CARDS_20, AI_PERSONAS_3 } from '@vietlearning/content';

// In-memory preferences state (Default initial)
let userPreferences = {
  voiceId: 'vi-VN-Standard-A',
  speed: 1.0,
  dialect: 'north',
  correctionLevel: 'gentle',
  persona: 'folk_boy',
  explainLang: 'vi'
};

export const contentRoutes: FastifyPluginAsync = async (server) => {
  // GET /v1/content/culture
  server.get('/content/culture', async () => {
    return CULTURE_CARDS_20;
  });

  // POST /v1/culture/ask
  server.post('/culture/ask', async (req: any, reply) => {
    try {
      const question = req.body?.question || '';
      const normalizedQ = question.toLowerCase();

      // Tìm thẻ văn hóa liên quan nhất
      const matchedCard = CULTURE_CARDS_20.find(card => {
        const text = `${card.title} ${card.summary} ${card.proverb} ${card.story}`.toLowerCase();
        return normalizedQ.split(' ').some((word: string) => word.length > 3 && text.includes(word));
      }) || CULTURE_CARDS_20[0];

      return {
        answer: `Bé Cu Tít chia sẻ: "${matchedCard.story}"\n\nNét đẹp văn hóa: ${matchedCard.summary} (Tục ngữ: "${matchedCard.proverb}")`,
        sources: [matchedCard.id, matchedCard.title],
        suggestedDos: matchedCard.dos,
        suggestedDonts: matchedCard.donts
      };
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ error: { code: 'SERVER_ERROR', message: err.message } });
    }
  });

  // POST /v1/vision/label
  server.post('/vision/label', async () => {
    return {
      items: [
        { vi: 'Nón lá', en: 'Conical hat', box: [10, 20, 80, 90] },
        { vi: 'Phở bò', en: 'Beef pho soup', box: [30, 40, 150, 180] },
        { vi: 'Bánh mì', en: 'Vietnamese baguette', box: [50, 60, 200, 250] },
        { vi: 'Cà phê phin', en: 'Drip filter coffee', box: [70, 80, 120, 160] }
      ]
    };
  });

  // GET /v1/pitch/reference/:id
  server.get('/pitch/reference/:id', async (req: any) => {
    return {
      itemId: req.params.id,
      tone: 'sac',
      contourSemitones: [12.0, 13.5, 15.0, 16.5]
    };
  });

  // GET /v1/srs/due
  server.get('/srs/due', async () => {
    return [
      { id: 'card-1', itemRef: 'dạ_chào_cô', topic: 'Chào hỏi', ease: 250, intervalDays: 1, dueAt: new Date().toISOString() },
      { id: 'card-2', itemRef: 'phở_bò_tái', topic: 'Ẩm thực', ease: 260, intervalDays: 2, dueAt: new Date().toISOString() },
      { id: 'card-3', itemRef: 'bắp_ngô', topic: 'Phương ngữ', ease: 240, intervalDays: 1, dueAt: new Date().toISOString() },
      { id: 'card-4', itemRef: 'cà_phê_sữa_đá', topic: 'Ẩm thực', ease: 250, intervalDays: 1, dueAt: new Date().toISOString() }
    ];
  });

  // GET /v1/analytics/summary
  server.get('/analytics/summary', async () => {
    return {
      streakDays: 7,
      studyMinutes: 52,
      accuracyRate: 92,
      dueCardsCount: 4,
      cefrEstimate: 'A2 - Sơ cấp',
      masteredCount: 38,
      skillScores: {
        phonetics: 88,
        grammar: 92,
        honorific: 96,
        dialect: 84,
        culture: 90,
        speaking: 86
      }
    };
  });

  // GET /v1/preferences
  server.get('/preferences', async () => {
    return {
      ...userPreferences,
      personas: AI_PERSONAS_3
    };
  });

  // PUT /v1/preferences
  server.put('/preferences', async (req: any) => {
    const body = req.body || {};
    userPreferences = {
      ...userPreferences,
      ...body
    };
    return {
      success: true,
      preferences: userPreferences
    };
  });
};
