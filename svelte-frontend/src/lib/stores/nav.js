import { writable } from 'svelte/store'

// The vertical areas of the app (see AI_PLANNING.md, Phase 2).
export const views = [
  { id: 'folders', label: 'Folders', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z' },
  { id: 'random', label: 'Random', icon: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5' },
  { id: 'favorites', label: 'Favorites', icon: 'M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6.5 5.3 5.3 0 0 1 21.3 12C19 16.4 12 21 12 21z' },
  { id: 'history', label: 'History', icon: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2' },
  { id: 'queue', label: 'Queue', icon: 'M4 6h16M4 12h10M4 18h7M17 15l4 3-4 3z' },
  { id: 'radio', label: 'Radio', icon: 'M4 9h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 9l10-5M8 14h.01M13 14h5M13 17h5' },
  { id: 'bandcamp', label: 'Bandcamp', icon: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
]

const validIds = views.map((v) => v.id)

export const currentView = writable('history')

/** Switch view; ignores ids that aren't a valid view. */
export function setView(id) {
  if (validIds.includes(id)) currentView.set(id)
}
