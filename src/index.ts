import Fastify from 'fastify';
import { stateRoutes } from './routes/state.js'

const app = Fastify({ logger: true });

await app.register(stateRoutes)

app.get('/health', async () => {
  return { status: 'ok' };
});

const port = process.env.PORT || 3001;

app.listen({ port, host: '0.0.0.0' })
  .then(() => {
    console.log(`FlowState running on ${port}`);
  })
  .catch(err => {
    app.log.error(err);
    process.exit(1);
  });
