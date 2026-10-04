import { FastifyPluginAsync } from 'fastify';

export const contentRoutes: FastifyPluginAsync = async (server) => {
  // POST /v1/vision/label
  server.post('/vision/label', async () => {
    return {
      items: [
        { vi: 'Nón lá', en: 'Conical hat', box: [10, 20, 80, 90] },
        { vi: 'Quán nước gốc đa', en: 'Banyan tree tea stall', box: [50, 60, 200, 300] }
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

  // POST /v1/culture/ask
  server.post('/culture/ask', async (req: any) => {
    return {
      answer: 'Ở Việt Nam, khi chào người lớn tuổi, người nhỏ thường khoanh tay trước ngực để bày tỏ sự kính trọng.',
      sources: ['card_c1_khoanh_tay']
    };
  });

  // GET /v1/srs/due
  server.get('/srs/due', async () => {
    return [
      { id: 'card-1', itemRef: 'ngô_bắp', ease: 250, intervalDays: 1, dueAt: new Date().toISOString() }
    ];
  });

  // GET /v1/analytics/summary
  server.get('/analytics/summary', async () => {
    return {
      streakDays: 5,
      studyMinutes: 45,
      accuracyRate: 88,
      dueCardsCount: 3,
      cefrEstimate: 'A1'
    };
  });

  // GET & PUT /v1/preferences
  server.get('/preferences', async () => {
    return {
      voiceId: 'vi-VN-Standard-A',
      speed: 1.0,
      dialect: 'north',
      correctionLevel: 'gentle',
      persona: 'be_cu_tit'
    };
  });
};
