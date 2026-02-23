export type RunId = string

export type StateStatus = 'running' | 'success' | 'error'

export interface StateContext {
  engine?: string
  executionId?: string
  [key: string]: unknown
}

export interface StateMeta {
  id: RunId
  version: number
  step: number
  status: StateStatus
  createdAt: number
  updatedAt: number
}

export interface State {
  meta: StateMeta
  context: StateContext
  assets: Record<string, unknown>
  sections: unknown[]
  output: Record<string, unknown>
  errors: unknown[]
  debug: Record<string, unknown>
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? T[K] extends any[]
      ? T[K]
      : DeepPartial<T[K]>
    : T[K]
}

export type StoreEntry = {
  state: State
  expiresAt: number
}