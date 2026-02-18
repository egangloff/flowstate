import { randomUUID } from 'node:crypto'

const store = new Map()

const DEFAULT_STATE = {
  meta: {},
  context: {},
  assets: {},
  sections: [],
  output: {},
  errors: [],
  debug: {}
}

export function createState(initial = {}) {
  const runId = randomUUID()

  store.set(runId, {
    state: structuredClone({
      ...DEFAULT_STATE,
      ...initial
    }),
    createdAt: Date.now()
  })

  return {
    runId,
    state: store.get(runId).state
  }
}

export function getState(runId) {
  return store.get(runId)?.state ?? null
}

export function setState(runId, state) {
  const entry = store.get(runId)
  if (!entry) return null

  entry.state = state
  return state
}

export function deleteState(runId) {
  return store.delete(runId)
}

export function hasState(runId) {
  return store.has(runId)
}


export function updateContext(runId, patch) {
  const state = store.get(runId);
  if (!state) return null;

  state.context = {
    ...state.context,
    ...patch
  };

  return state.context;
}

