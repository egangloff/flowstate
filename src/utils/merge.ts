export function deepMerge(target, patch) {
  for (const key of Object.keys(patch)) {
    if (
      patch[key] &&
      typeof patch[key] === 'object' &&
      !Array.isArray(patch[key])
    ) {
      target[key] ??= {}
      deepMerge(target[key], patch[key])
    } else {
      target[key] = patch[key]
    }
  }
  return target
}
