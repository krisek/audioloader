import { writable } from 'svelte/store'

// Theme preference: 'system' | 'light' | 'dark'. Client-side only (localStorage), never sent to the server.
const KEY = 'theme'
const hasDom = typeof document !== 'undefined'
const media = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: light)') : null

function initial() {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

export const theme = writable(initial())

let current = initial()

function apply() {
  if (!hasDom) return
  const resolved = current === 'system' ? (media?.matches ? 'light' : 'dark') : current
  document.documentElement.dataset.theme = resolved
}

theme.subscribe((v) => {
  current = v
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, v)
  apply()
})

media?.addEventListener?.('change', apply)
