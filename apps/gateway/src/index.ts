import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { chatRoutes } from './routes/chat.js';

const fastify = Fastify({ logger: true });

async function start() {
  await fastify.register(cors, { origin: true });
  await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // Đăng ký các Facade Routes
  await fastify.register(chatRoutes, { prefix: '/v1' });

  fastify.get('/health', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

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
