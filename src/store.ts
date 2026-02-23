import { randomUUID } from 'node:crypto'
import type { State, StateContext, StoreEntry, RunId } from '@types'

// Map<runId, { state }>
const store = new Map<RunId, StoreEntry>()

// Map<contextKey, runId>
export const contextIndex = new Map<string, RunId>()

const DEFAULT_TTL_MS =
  (Number(process.env.FLOWSTATE_DEFAULT_TTL) || 3600) * 1000

const MAX_TTL_MS =
  (Number(process.env.FLOWSTATE_MAX_TTL) || 86400) * 1000

const SWEEP_INTERVAL_MS = 5 * 60 * 1000
const MAX_CONTEXTS = 5000

if (DEFAULT_TTL_MS > MAX_TTL_MS) {
  throw new Error(
    "FLOWSTATE_DEFAULT_TTL cannot exceed FLOWSTATE_MAX_TTL"
  )
}

const DEFAULT_STATE: Omit<State, 'meta' | 'context'> = {
  assets: {},
  sections: [],
  appendCount: 0,
  output: {},
  errors: [],
  debug: {}
}

function resolveTTL(ttlSeconds?: number): number {
  const ttlMs = ttlSeconds
    ? ttlSeconds * 1000
    : DEFAULT_TTL_MS

  return Math.min(ttlMs, MAX_TTL_MS)
}

export function createState(
  {
    context = {},
    onConflict = 'error',
    ttl
  }: {
    context?: StateContext
    onConflict?: 'error' | 'resume' | 'replace'
    ttl?: number
  } = {}
): { runId: RunId; state: State } {

  if (store.size >= MAX_CONTEXTS) {
    throw new Error('FLOWSTATE_MAX_CONTEXTS_REACHED')
  }

  const existingRunId = getRunIdByContext(context)

  if (existingRunId) {
    if (onConflict === 'resume') {
      const state = getState(existingRunId)!
      return { runId: existingRunId, state }
    }

    if (onConflict === 'replace') {
      deleteState(existingRunId)
    }

    if (onConflict === 'error') {
      throw new Error('STATE_CONTEXT_CONFLICT')
    }
  }

  const runId = randomUUID()

  const state: State = {
    meta: {
      id: runId,
      version: 1,
      step: 0,
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    context,
    assets: {},
    sections: [],
    appendCount: 0,
    output: {},
    errors: [],
    debug: {}
  }

  const key = makeContextKey(context)
  if (key) contextIndex.set(key, runId)

  store.set(runId, {
    state,
    expiresAt: Date.now() + resolveTTL(ttl)
  })

  return { runId, state }
}

export function setState(runId: RunId, newState: State): State | null {
  const entry = store.get(runId)
  if (!entry) return null

  const oldKey = makeContextKey(entry.state.context)
  if (oldKey) contextIndex.delete(oldKey)

  newState.meta.updatedAt = Date.now()

  entry.state = newState
  entry.expiresAt = Date.now() + DEFAULT_TTL_MS

  const newKey = makeContextKey(newState.context)
  if (newKey) contextIndex.set(newKey, runId)

  return entry.state
}

export function getState(runId: RunId): State | null {
  const entry = store.get(runId)
  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    deleteState(runId)
    return null
  }

  return entry.state
}

export function deleteState(runId: RunId): boolean {
  const entry = store.get(runId)
  if (!entry) return false

  const key = makeContextKey(entry.state.context)
  if (key) contextIndex.delete(key)

  return store.delete(runId)
}

export function updateState(
  runId: RunId,
  updater: (state: State) => void
): State | null {
  const entry = store.get(runId)
  if (!entry) return null

  updater(entry.state)
  entry.state.meta.updatedAt = Date.now()
  entry.expiresAt = Date.now() + DEFAULT_TTL_MS

  return entry.state
}

export function getStateByContext(
  context: StateContext
): State | null {
  const key = makeContextKey(context)
  if (!key) return null

  const runId = contextIndex.get(key)
  if (!runId) return null

  return getState(runId)
}

export function updateContext(
  runId: RunId,
  patch: Partial<StateContext>
): StateContext | null {
  const entry = store.get(runId)
  if (!entry) return null

  entry.state.context = {
    ...entry.state.context,
    ...patch
  }

  const key = makeContextKey(entry.state.context)
  if (key) contextIndex.set(key, runId)

  return entry.state.context
}

function makeContextKey(context: StateContext): string | null {
  if (!context.engine || !context.executionId) return null
  return `${context.engine}:${context.executionId}`
}

export function getRunIdByContext(
  context: StateContext
): RunId | null {
  const key = makeContextKey(context)
  if (!key) return null
  return contextIndex.get(key) ?? null
}

function sweep() {
  const now = Date.now()

  for (const [runId, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      deleteState(runId)
    }
  }
}

setInterval(sweep, SWEEP_INTERVAL_MS)