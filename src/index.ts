import Fastify from 'fastify';
import { stateRoutes } from './routes/state.js'

const START_TIME = Date.now()

const app = Fastify({ logger: true })

await app.register(stateRoutes)

app.get('/health', async () => {
  return {
    status: 'ok',
    service: 'flowstate',
    version: '1.0.0',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString()
  }
})

const port = Number(process.env.FLOWSTATE_PORT || 3004)

app.listen({ port, host: '0.0.0.0' })
  .then(() => {
    console.log(`FlowState running on ${port}`)
  })
  .catch(err => {
    app.log.error(err);
    process.exit(1);
  });
