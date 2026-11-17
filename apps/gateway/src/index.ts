import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { chatRoutes } from './routes/chat.js';
import { speechRoutes } from './routes/speech.js';
import { practiceRoutes } from './routes/practice.js';
import { contentRoutes } from './routes/content.js';
import { visionRoutes } from './routes/vision.js';
import { roleplayRoutes } from './routes/roleplay.js';

const fastify = Fastify({ logger: true });

async function start() {
  await fastify.register(cors, { origin: true });
  await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // Đăng ký toàn bộ 14 Endpoint RESTful chuẩn /v1 theo Mục 6.3 TDD
  await fastify.register(chatRoutes, { prefix: '/v1' });
  await fastify.register(speechRoutes, { prefix: '/v1' });
  await fastify.register(speechRoutes, { prefix: '/api' });
  await fastify.register(practiceRoutes, { prefix: '/v1' });
  await fastify.register(contentRoutes, { prefix: '/v1' });
  await fastify.register(visionRoutes, { prefix: '/v1' });
  await fastify.register(roleplayRoutes, { prefix: '/v1' });

  fastify.get('/healthz', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

  const port = Number(process.env.PORT) || 4000;
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Gateway running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
