import { writable } from 'svelte/store'

const KEY = 'view_preference'

function initial() {
  if (typeof localStorage === 'undefined') return 'grid'
  const saved = localStorage.getItem(KEY)
  return saved === 'list' || saved === 'grid' ? saved : 'grid'
}

/** Global layout choice for all content views: 'grid' | 'list'. Persisted. */
export const viewPreference = writable(initial())

viewPreference.subscribe((v) => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, v)
})

/** Last path segment of a folder path ("a/b/Album" -> "Album"). */
export function baseName(path) {
  const parts = String(path || '').split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : String(path || '')
}
