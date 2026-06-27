import { test, expect } from 'vitest';
import Fastify from 'fastify';

test('GET /health returns ok', async () => {
  const fastify = Fastify();
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok' };
  });

  const response = await fastify.inject({
    method: 'GET',
    url: '/health'
  });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.payload)).toEqual({ status: 'ok' });
});
