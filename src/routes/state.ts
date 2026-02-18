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

  /**
   *  CREATE 
   */ 
  fastify.post<{
    Body: { context?: StateContext }
  }>('/state', async (req) => {
    return createState(req.body ?? {})
  })

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
