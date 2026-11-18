import { writable, get } from 'svelte/store'
import { apiUrl } from './config.js'
import { refreshCurrentSong } from './mpd.js'

// Shared data layer for Folders / Favorites / History / Random.
// Endpoint shapes: MPD_API_MAPPING.md sections 2.2 and 3.

/** Set of favourite directory paths. Single source of truth for the heart flag. */
export const favourites = writable(new Set())

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Normalise a directory entry from any listing endpoint. */
function toItem(e) {
  const count = e.count || {}
  return {
    name: e.directory,
    playhours: count.playhours || '',
    playtime: parseInt(count.playtime, 10) || 0,
    songs: parseInt(count.songs, 10) || 0,
  }
}

/** Last path segment. */
export function baseName(path) {
  return String(path || '').replace(/\\/g, '/').replace(/.*\//, '')
}

function compareNC(a, b) {
  return a.toUpperCase().localeCompare(b.toUpperCase())
}

/**
 * Legacy grouping, as one model for both grid and list:
 * sort by full path (case-insensitive), group by first letter of the title.
 * The initial is upper-cased so "a..." and "A..." share one group (legacy quirk fixed).
 * Returns [{ initial, items }].
 */
export function groupItems(items) {
  const sorted = [...items].sort((a, b) => compareNC(a.name, b.name))
  const groups = new Map()
  for (const it of sorted) {
    const initial = baseName(it.name).substring(0, 1).toUpperCase() || '#'
    if (!groups.has(initial)) groups.set(initial, [])
    groups.get(initial).push(it)
  }
  return [...groups.entries()]
    .sort((a, b) => compareNC(a[0], b[0]))
    .map(([initial, list]) => ({ initial, items: list }))
}

/** /search -> { dirs, files } (same DirTree shape as /ls). Aborts via signal when superseded. */
export async function searchFolders(pattern, signal) {
  const res = await fetch(apiUrl('search', { pattern }), { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseTree(await res.json())
}

/** /ls -> { dirs: Item[], files: FileEntry[] } */
export async function fetchDirectory(directory = '.') {
  return parseTree(await getJson(apiUrl('ls', { directory })))
}

function parseTree(data) {
  const tree = data.tree || []
  return {
    dirs: tree.filter((e) => 'directory' in e).map(toItem),
    files: tree
      .filter((e) => 'file' in e)
      .map((e) => ({
        file: e.file,
        title: e.title || baseName(e.file),
        track: e.track || '',
        duration: parseFloat(e.duration) || 0,
      })),
  }
}

/** /favourites | /history | /randomset -> Item[] in server order. */
export async function fetchSpec(spec) {
  const data = await getJson(apiUrl(spec, {}, { withClient: true }))
  return (data.tree || []).filter((e) => 'directory' in e).map(toItem)
}

export async function loadFavourites() {
  const list = await fetchSpec('favourites')
  favourites.set(new Set(list.map((i) => i.name)))
  return list
}

/** Add/remove a favourite, updating the shared set once the server answers. */
export async function toggleFavourite(path) {
  const isFav = get(favourites).has(path)
  const res = await fetch(apiUrl(isFav ? 'remove_favourite' : 'add_favourite', { directory: path }, { withClient: true }))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  favourites.update((s) => {
    const next = new Set(s)
    if (isFav) next.delete(path)
    else next.add(path)
    return next
  })
}

/** Ask the server for a fresh 12-album set. */
export async function generateRandomSet() {
  const data = await getJson(apiUrl('generate_randomset', {}, { withClient: true }))
  if (data.result !== 'ok') throw new Error('generate_randomset failed')
}

/** Legacy "Play": /addplay clears the queue and plays; the server also records history. */
export async function playDirectory(directory) {
  const res = await fetch(apiUrl('addplay', { directory }, { withClient: true }))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await refreshCurrentSong()
}

// ---------------------------------------------------------------------------
// Radio & Bandcamp (MPD_API_MAPPING.md sections 2.4 and 3.5)
// ---------------------------------------------------------------------------

/** Radio history -> StreamItem[] newest first. A user with no file gets { tree: [] }. */
export async function fetchRadioHistory() {
  const data = await getJson(apiUrl('radio_history', {}, { withClient: true }))
  const ids = data.radio_history || []
  const stations = data.stations || {}
  return ids
    .map((id) => stations[id])
    .filter(Boolean)
    .map((s) => ({ key: s.stationuuid, kind: 'radio', name: s.name, url: s.url, stationuuid: s.stationuuid, favicon: s.favicon, subtitle: '' }))
    .reverse()
}

/** /search_radio -> StreamItem[] */
export async function searchRadio(pattern, signal) {
  const res = await fetch(apiUrl('search_radio', { pattern }), { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return (data.tree || []).map((s) => ({
    key: s.stationuuid,
    kind: 'radio',
    name: (s.name || '').trim(),
    url: s.url,
    stationuuid: s.stationuuid,
    favicon: s.favicon,
    subtitle: s.bitrate ? `${s.bitrate} kbps` : '',
  }))
}

/** Bandcamp history -> StreamItem[] newest first. An empty user comes back as {}. */
export async function fetchBandcampHistory() {
  const data = await getJson(apiUrl('bandcamp_history', {}, { withClient: true }))
  const urls = data.bandcamp_history || []
  const links = data.links || {}
  return urls
    .map((u) => links[u])
    .filter(Boolean)
    .map((l) => ({ key: l.url, kind: 'bandcamp', name: l.title || l.url, url: l.url, stationuuid: '', favicon: l.favicon, subtitle: l.artist || '' }))
    .reverse()
}

/** Resolve a Bandcamp/YouTube URL; the legacy client uses only tree[0]. Returns StreamItem | null. */
export async function lookupBandcamp(pattern) {
  const data = await getJson(apiUrl('search_bandcamp', { pattern }))
  const t = (data.tree || [])[0]
  if (!t) return null
  return { key: t.url, kind: 'bandcamp', name: t.title || t.url, url: t.url, stationuuid: '', favicon: t.art, subtitle: t.artist || '' }
}

/** Play a radio station or Bandcamp/YouTube URL via /addplay (the server records history). */
export async function playStream(item) {
  const params = { url: item.url, name: item.name, favicon: item.favicon }
  if (item.kind === 'radio') params.stationuuid = item.stationuuid
  const res = await fetch(apiUrl('addplay', params, { withClient: true }))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await refreshCurrentSong()
}

/** Remove a radio/Bandcamp history entry. The endpoint takes no mpd_port. */
export async function removeStreamHistory(item) {
  const params = { url: item.url }
  if (item.kind === 'radio') params.stationuuid = item.stationuuid
  const res = await fetch(apiUrl('remove_history', params, { withClient: true, withPort: false }))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/** Append one library file to the queue and start playing if idle (/addplay?file=). */
export async function enqueueFile(file) {
  const res = await fetch(apiUrl('addplay', { file }))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await refreshCurrentSong()
}

/** Current queue -> { queue: [{id,pos,file,title,artist,album,duration}], current_id }. */
export async function fetchQueue() {
  const data = await getJson(apiUrl('queue'))
  return { queue: data.queue || [], current_id: data.current_id || '' }
}

/** action: queue_play | queue_remove (need id) or queue_clear. */
export async function queueAction(action, id) {
  const res = await fetch(apiUrl(action, { id }))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  await refreshCurrentSong()
}
