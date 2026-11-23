import { z } from 'zod';

export const PronunciationScoreSchema = z.object({
  attemptId: z.string().uuid(),
  word: z.string(),
  targetTone: z.enum(['ngang', 'huyen', 'sac', 'hoi', 'nga', 'nang']),
  dtwScore: z.number().min(0).max(100),
  pearsonCorrelation: z.number().min(-1).max(1),
  isAccurate: z.boolean(),
  audioFeedback: z.string()
});

export type PronunciationScore = z.infer<typeof PronunciationScoreSchema>;
