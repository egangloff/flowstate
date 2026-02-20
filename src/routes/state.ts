import {
  createState,
  getState,
  setState,
  deleteState,
  updateContext,
  getStateByContext
} from '../store.js'
import type { StateContext, State, DeepPartial } from '@types'
import { deepMerge } from '../utils/merge.js'
import type { FastifyInstance } from 'fastify'

type StateParams = {
  id: string
}

type StatePatchBody = DeepPartial<State>

type StateReply =
  | State
  | { error: string }

export async function stateRoutes(fastify: FastifyInstance) {
  
  fastify.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing token' })
    }

    if (authHeader.slice(7) !== process.env.FLOWSTATE_API_KEY) {
      return reply.code(403).send({ error: 'Invalid token' })
    }
  })

  /**
   *  CREATE 
   */ 
  fastify.post<{
    Body: {
      context?: StateContext
      onConflict?: 'error' | 'resume' | 'replace'
    }
    Reply:
      | { runId: string; state: State }
      | { error: string }
  }>(
    '/state',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            context: {
              type: 'object',
              additionalProperties: true
            },
            onConflict: {
              type: 'string',
              enum: ['error', 'resume', 'replace']
            }
          }
        }
      }
    },
    async (req, reply) => {
      try {
        return createState(req.body ?? {})
      } catch (err) {
        if ((err as Error).message === 'STATE_CONTEXT_CONFLICT') {
          return reply.code(409).send({
            error: 'state already exists for this context'
          })
        }
        throw err
      }
    }
  )


  /**
   *  GET 
   */
  fastify.get<{
    Params: { id: string }
    Reply: State | { error: string }
  }>('/state/:id', async (req, reply) => {
    const state = getState(req.params.id)
    if (!state) {
      return reply.code(404).send({ error: 'State not found' })
    }
    return state
  })

  /**
   *  PATCH 
   */
  fastify.patch<{
    Params: StateParams,
    Body: StatePatchBody
    Reply: StateReply | { error: string }
  }>('/state/:id', async (req, reply) => {
    const state = getState(req.params.id)
    if (!state) {
      return reply.code(404).send({ error: 'State not found' })
    }

    deepMerge(state, req.body)
    setState(req.params.id, state)

    return state
  })


  /**
   *  APPEND 
   */
  fastify.post<{
    Params: { id: string }
    Body: { path: keyof State; value: unknown }
    Reply: State | { error: string }
  }>('/state/:id/append', async (req, reply) => {
    const { path, value } = req.body
    const state = getState(req.params.id)

    if (!state) {
      return reply.code(404).send({ error: 'State not found' })
    }

    const target = state[path]
    if (!Array.isArray(target)) {
      return reply.code(400).send({
        error: 'Invalid append path (must be an array)'
      })
    }

    target.push(value)
    return state
  })

  
  /**
   *  DELETE 
   */
  fastify.delete<{
    Params: { id: string }
  }>('/state/:id', async (req) => {
    deleteState(req.params.id)
    return { ok: true }
  })
  
  /**
   *  UPDATE CONTEXT 
   */
  fastify.patch<{
    Params: { runId: string }
    Body: StateContext
    Reply: { runId: string; context: StateContext } | { error: string }
  }>('/state/:runId/context', async (req, reply) => {
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

  
  /**
   *  GET BY CONTEXT 
   */
  fastify.post<{
    Body: { engine: string; executionId: string }
    Reply: State | { error: string; context?: StateContext }
  }>('/state/by-context', async (req, reply) => {
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
