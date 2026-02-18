import { randomUUID } from 'node:crypto'

// Map<runId, { state, createdAt }>
const store = new Map()

// Map<contextKey, runId>
const contextIndex = new Map()

const DEFAULT_STATE = {
  meta: {
    version: 1,
    step: 0,
    status: 'running'
  },
  context: {},
  assets: {},
  sections: [],
  output: {},
  errors: [],
  debug: {}
}

export function createState({ context = {} } = {}) {
  const runId = randomUUID()

  const state = structuredClone(DEFAULT_STATE)

  state.meta = {
    id: runId,
    version: 1,
    step: 0,
    status: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  state.context = context
  
  const key = makeContextKey(context)
  if (key) {
    contextIndex.set(key, runId)
  }

  store.set(runId, { state })

  return { runId, state }
}

export function setState(runId, newState) {
  const entry = store.get(runId)
  if (!entry) return null

  // cleanup old index
  const oldKey = makeContextKey(entry.state.context)
  if (oldKey) contextIndex.delete(oldKey)

  entry.state = newState
  entry.state.meta.updatedAt = Date.now()

  // index new context
  const newKey = makeContextKey(newState.context)
  if (newKey) contextIndex.set(newKey, runId)

  return entry.state
}

export function getState(runId) {
  return store.get(runId)?.state ?? null
}

export function deleteState(runId) {
  const entry = store.get(runId)
  if (!entry) return false

  const key = makeContextKey(entry.state.context)
  if (key) contextIndex.delete(key)

  return store.delete(runId)
}

export function updateState(runId, updater) {
  const entry = store.get(runId)
  if (!entry) return null

  updater(entry.state)
  entry.state.meta.updatedAt = Date.now()

  return entry.state
}



export function getStateByContext(context) {
  const key = makeContextKey(context)
  if (!key) return null

  const runId = contextIndex.get(key)
  if (!runId) return null

  return getState(runId)
}


export function updateContext(runId, patch) {
  const entry = store.get(runId)
  if (!entry) return null

  entry.state.context = {
    ...entry.state.context,
    ...patch
  }

  const key = makeContextKey(entry.state.context)
  if (key) {
    contextIndex.set(key, runId)
  }

  return entry.state.context
}

function makeContextKey(context) {
  if (!context.engine || !context.executionId) return null
  return `${context.engine}:${context.executionId}`
}