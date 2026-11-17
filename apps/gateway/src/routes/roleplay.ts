import { FastifyPluginAsync } from 'fastify';
import { ROLEPLAY_SCENARIOS_4 } from '@vietlearning/content';
import { RoleplayStepRequestSchema } from '@vietlearning/contracts';

export const roleplayRoutes: FastifyPluginAsync = async (server) => {
  // GET /v1/roleplay/scenarios
  server.get('/roleplay/scenarios', async () => {
    return {
      success: true,
      count: ROLEPLAY_SCENARIOS_4.length,
      scenarios: ROLEPLAY_SCENARIOS_4
    };
  });

  // POST /v1/roleplay/step
  server.post('/roleplay/step', async (req, reply) => {
    try {
      const { scenarioId, stepId, choiceId, userAudioText } = RoleplayStepRequestSchema.parse(req.body);

      const scenario = ROLEPLAY_SCENARIOS_4.find(s => s.id === scenarioId);
      if (!scenario) {
        return reply.status(404).send({ error: { code: 'SCENARIO_NOT_FOUND', message: 'Scenario not found' } });
      }

      const currentStep = scenario.steps.find(st => st.id === stepId);
      if (!currentStep) {
        return reply.status(404).send({ error: { code: 'STEP_NOT_FOUND', message: 'Step not found' } });
      }

      let matchedChoice = choiceId
        ? currentStep.choices.find(c => c.id === choiceId)
        : undefined;

      // Nếu người dùng nhập/nói văn bản (audio STT)
      if (!matchedChoice && userAudioText) {
        const normalized = userAudioText.toLowerCase();
        // So khớp từ khóa với các lựa chọn
        matchedChoice = currentStep.choices.find(c => {
          const choiceWords = c.text.toLowerCase().split(' ');
          return choiceWords.some(w => w.length > 2 && normalized.includes(w));
        });
      }

      // Fallback lấy lựa chọn đầu tiên
      if (!matchedChoice) {
        matchedChoice = currentStep.choices[0];
      }

      return {
        npcResponse: matchedChoice.npcResponse,
        npcAudioPrompt: `/v1/speech/synthesize?text=${encodeURIComponent(matchedChoice.npcResponse)}`,
        feedback: matchedChoice.feedback,
        honorificScore: matchedChoice.honorificScore,
        naturalScore: matchedChoice.naturalScore,
        syntaxScore: matchedChoice.syntaxScore,
        nextStepId: matchedChoice.nextStepId,
        isCompleted: !!matchedChoice.isCompleted
      };
    } catch (err: any) {
      server.log.error(err);
      return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: err.message } });
    }
  });
};
