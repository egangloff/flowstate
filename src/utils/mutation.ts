import { updateState } from '../store.js'
import type { State } from '@types'

export function applyMutation(
  runId: string,
  mutator: (s: State) => void
) {
  return updateState(runId, (s: State) => {
    mutator(s)
  })
}