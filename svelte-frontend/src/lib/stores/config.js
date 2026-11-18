import { writable, get } from 'svelte/store'

// Mirrors the legacy Angular settings (see MPD_API_MAPPING.md §2.1).
// Bootstrap config comes from /app-config.json; runtime settings live in localStorage.

const DEFAULTS = {
  mpd_server: 'localhost:6600',
  client_id: 'guest',
  list_from: 60,
  last_directory: '.',
}

function readSettings() {
  const ls = typeof localStorage !== 'undefined' ? localStorage : null
  const get_ = (key) => (ls ? ls.getItem(key) : null)
  return {
    mpd_server: get_('mpd_server') || DEFAULTS.mpd_server,
    client_id: get_('client_id') || DEFAULTS.client_id,
    list_from: parseInt(get_('list_from'), 10) || DEFAULTS.list_from,
    last_directory: get_('last_directory') || DEFAULTS.last_directory,
    stream: get_('stream') || '',
    stream_updated: get_('stream_updated') === 'true',
    log: get_('log') || '',
  }
}

export const config = writable({
  loaded: false,
  error: null,
  servicesBasePath: '',
  ...readSettings(),
})

/** Fetch app-config.json (servicesBasePath) and merge in localStorage settings. */
export async function loadConfig() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}app-config.json`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const base = String(data.servicesBasePath || '').replace(/\/+$/, '')
    config.update((c) => ({ ...c, ...readSettings(), servicesBasePath: base, loaded: true, error: null }))
  } catch (e) {
    config.update((c) => ({ ...c, loaded: false, error: e.message || String(e) }))
  }
  return get(config)
}

/** True for "host", "host:port", "[::1]:6600" (port 1-65535). Mirrors the backend check. */
export function isValidMpdServer(value) {
  const s = String(value || '').trim()
  if (!s || /[\s/?#@]/.test(s)) return false
  const m = s.match(/^(?:\[[^\]]+\]|[^:]+)(?::(\d+))?$/)
  if (!m) return false
  return m[1] === undefined || (+m[1] >= 1 && +m[1] <= 65535)
}

/** Persist one runtime setting to localStorage and update the store. */
export function setSetting(key, value) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(value))
  config.update((c) => ({ ...c, ...readSettings() }))
}

/**
 * Build a backend URL. Adds mpd_server (host:port) always and client_id when withClient is true.
 * Every param value is URL-encoded (fixes the legacy unencoded /addplay params).
 */
export function apiUrl(endpoint, params = {}, { withClient = false, withPort = true } = {}) {
  const c = get(config)
  const q = new URLSearchParams()
  if (withPort) q.set('mpd_server', c.mpd_server)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v)
  }
  if (withClient) q.set('client_id', c.client_id)
  return `${c.servicesBasePath}/${endpoint}?${q.toString()}`
}
