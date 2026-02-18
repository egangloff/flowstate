import type { DeepPartial } from '@types'

export function deepMerge<T extends object>(
  target: T,
  source: DeepPartial<T>
): T {
  for (const key in source) {
    const value = source[key]

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      if (!(key in target)) {
        ;(target as any)[key] = {}
      }
      deepMerge(
        (target as any)[key],
        value as any
      )
    } else if (value !== undefined) {
      ;(target as any)[key] = value
    }
  }

  return target
}
