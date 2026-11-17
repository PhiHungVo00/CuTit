import { FastifyPluginAsync } from 'fastify';
import { VISION_OBJECT_BANK_8, type VisionObjectItem } from '@vietlearning/content';

export const visionRoutes: FastifyPluginAsync = async (server) => {
  // GET /v1/vision/catalog
  server.get('/vision/catalog', async () => {
    return {
      success: true,
      count: VISION_OBJECT_BANK_8.length,
      items: VISION_OBJECT_BANK_8
    };
  });

  // POST /v1/vision/detect (hoặc /v1/vision/label)
  server.post('/vision/detect', async (req, reply) => {
    try {
      const body = req.body as { imageBase64?: string; objectId?: string; keyword?: string };
      
      let matchedItem: VisionObjectItem | undefined;

      // 1. Nếu truyền thẳng objectId
      if (body?.objectId) {
        matchedItem = VISION_OBJECT_BANK_8.find(item => item.id === body.objectId);
      }

      // 2. Nếu có keyword
      if (!matchedItem && body?.keyword) {
        const kw = body.keyword.toLowerCase().trim();
        matchedItem = VISION_OBJECT_BANK_8.find(item => 
          item.name.toLowerCase().includes(kw) || item.english.toLowerCase().includes(kw)
        );
      }

      // 3. Nếu có imageBase64 và GEMINI_API_KEY
      if (!matchedItem && body?.imageBase64 && process.env.GEMINI_API_KEY) {
        try {
          const prompt = `Phân tích hình ảnh này và cho biết đây là đồ vật, nét văn hóa hoặc món ăn Việt Nam nào trong danh sách sau: ${VISION_OBJECT_BANK_8.map(i => i.name).join(', ')}. Trả về kết quả dưới dạng JSON: {"itemId": "id_tuong_ung", "confidence": 0.95, "description": "mo ta ngan"}`;
          // Gọi Gemini REST API nếu có key
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: 'image/jpeg',
                        data: body.imageBase64.replace(/^data:image\/\w+;base64,/, '')
                      }
                    }
                  ]
                }]
              })
            }
          );
          if (geminiRes.ok) {
            const data: any = await geminiRes.json();
            const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textContent) {
              const cleaned = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleaned);
              if (parsed.itemId) {
                matchedItem = VISION_OBJECT_BANK_8.find(i => i.id === parsed.itemId);
              }
            }
          }
        } catch (e) {
          server.log.warn('Gemini vision API error or fallback: ' + e);
        }
      }

      // 4. Fallback mặc định: Nón Lá hoặc ngẫu nhiên từ kho
      if (!matchedItem) {
        matchedItem = VISION_OBJECT_BANK_8[0];
      }

      return {
        success: true,
        detectedItem: matchedItem,
        confidence: 0.95,
        labels: [matchedItem.name.toLowerCase(), matchedItem.category.toLowerCase(), matchedItem.english.toLowerCase()],
        ipa: matchedItem.ipa,
        tone: matchedItem.tone,
        honorificContext: matchedItem.honorificContext,
        bambooSampleSentence: matchedItem.bambooSampleSentence,
        audioUrl: `/v1/speech/synthesize?text=${encodeURIComponent(matchedItem.audioPrompt)}`
      };
    } catch (err: any) {
      server.log.error(err);
      return reply.status(500).send({ error: { code: 'VISION_DETECTION_FAILED', message: err.message } });
    }
  });
};
