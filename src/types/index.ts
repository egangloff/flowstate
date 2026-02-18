export type RunId = string

export interface Meta {
  id: RunId
  version: number
  step: number
  status: 'running' | 'done' | 'error'
  createdAt: number
  updatedAt: number
}

export interface State {
  meta: Meta
  context: Record<string, unknown>
  assets: Record<string, unknown>
  sections: unknown[]
  output: Record<string, unknown>
  errors: unknown[]
  debug: Record<string, unknown>
}
