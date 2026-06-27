import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

fastify.get('/health', async function handler (request, reply) {
  return { status: 'ok' };
});

// A dummy mechanism to simulate setting current_society_id for a transaction
fastify.decorateRequest('current_society_id', null);
fastify.addHook('onRequest', async (request, reply) => {
  const societyId = request.headers['x-society-id'];
  if (societyId) {
    (request as any).current_society_id = societyId;
  }
});

// Run the server!
try {
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
