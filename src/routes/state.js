import {
  createState,
  getState,
  setState,
  deleteState,
  updateContext,
  getStateByContext
} from '../store.js'
import { deepMerge } from '../utils/merge.js'

export async function stateRoutes(fastify) {

  // CREATE
  fastify.post('/state', async (req) => {
    return createState(req.body || {})
  })

  // GET
  fastify.get('/state/:id', async (req, reply) => {
    const state = getState(req.params.id)
    if (!state) return reply.code(404).send({ error: 'State not found' })
    return state
  })

  // PATCH
  fastify.patch('/state/:id', async (req, reply) => {
    const state = getState(req.params.id)
    if (!state) return reply.code(404).send({ error: 'State not found' })

    deepMerge(state, req.body)
    setState(req.params.id, state)

    return state
  })

  // APPEND
  fastify.post('/state/:id/append', async (req, reply) => {
    const { path, value } = req.body
    const state = getState(req.params.id)

    if (!state) {
      return reply.code(404).send({ error: 'State not found' })
    }

    if (!path || !Array.isArray(state[path])) {
      return reply.code(400).send({
        error: 'Invalid append path (must be an array)'
      })
    }

    state[path].push(value)
    return state
  })
  
  // DELETE
  fastify.delete('/state/:id', async (req) => {
    deleteState(req.params.id)
    return { ok: true }
  })
  
  // UPDATE CONTEXT
  fastify.patch('/state/:runId/context', async (req, reply) => {
    const { runId } = req.params
    const patch = req.body

    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return reply.code(400).send({
        error: 'context patch must be a JSON object'
      })
    }

    const context = updateContext(runId, patch)
    if (!context) {
      return reply.code(404).send({ error: 'state not found' })
    }

    return { runId, context }
  })
  
  // GET BY CONTEXT
  fastify.post('/state/by-context', async (req, reply) => {
    const { engine, executionId } = req.body

    if (!engine || !executionId) {
      return reply.code(400).send({
        error: 'engine and executionId required'
      })
    }

    const state = getStateByContext({ engine, executionId })
    if (!state) {
      return reply.code(404).send({
        error: 'state not found for context',
        context: { engine, executionId }
      })
    }

    return state
  })
}
