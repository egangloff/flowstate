import { randomUUID } from 'node:crypto'
import type { State, StateContext, StoreEntry, RunId } from '@types'

// Map<runId, { state }>
const store = new Map<RunId, StoreEntry>()

// Map<contextKey, runId>
const contextIndex = new Map<string, RunId>()

const DEFAULT_STATE: Omit<State, 'meta' | 'context'> = {
  assets: {},
  sections: [],
  output: {},
  errors: [],
  debug: {}
}

export function createState(
  {
    context = {},
    onConflict = 'error'
  }: {
    context?: StateContext
    onConflict?: 'error' | 'resume' | 'replace'
  } = {}
): { runId: RunId; state: State } {
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
    output: {},
    errors: [],
    debug: {}
  }

  const key = makeContextKey(context)
  if (key) contextIndex.set(key, runId)

  store.set(runId, { state })

  return { runId, state }
}

export function setState(runId: RunId, newState: State): State | null {
  const entry = store.get(runId)
  if (!entry) return null

  const oldKey = makeContextKey(entry.state.context)
  if (oldKey) contextIndex.delete(oldKey)

  newState.meta.updatedAt = Date.now()
  entry.state = newState

  const newKey = makeContextKey(newState.context)
  if (newKey) contextIndex.set(newKey, runId)

  return entry.state
}

export function getState(runId: RunId): State | null {
  return store.get(runId)?.state ?? null
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

function getRunIdByContext(
  context: StateContext
): RunId | null {
  const key = makeContextKey(context)
  if (!key) return null
  return contextIndex.get(key) ?? null
}
