import { writable, get } from 'svelte/store'
import { config, apiUrl } from './config.js'

// MPD playback state store. Data shape and polling rules: MPD_API_MAPPING.md §2.3.

// The server's /poll_currentsong returns on the next MPD idle event (or after 60 s), so this only
// guards against a hot loop when the server answers immediately (duplicate poll / capacity reached).
const POLL_MIN_DELTA = 1000 // min ms between poll starts
const RETRY_DELAYS = [1000, 2000, 4000, 8000] // reconnect backoff; the last value repeats
const STALE_POLL_MS = 60000 // re-poll if last poll started longer ago than this
const FOCUS_STALE_MS = 30000 // on window focus, re-poll if older than this

const initial = {
  state: 'stop',
  active: false,
  title: 'not playing',
  display_title: 'not playing',
  display_title_top: '',
  next_state: null,
  next_title: '',
  next_icon: '',
  elapsed: 0,
  duration: 0,
  consume: false,
  volume: null, // 0-100, or null when MPD has no mixer
  outputs: [],
  snapcast_clients: [],
  bandcamp_enabled: false,
  default_stream: '',
  error: null,
}

export const mpd = writable({ ...initial })

let running = false
let pollInFlight = false
let lastPollStarted = 0
let timer = null
let retryTimeout = null
let abortController = null
let failures = 0
let snapshotRetry = null

function retryDelay() {
  return RETRY_DELAYS[Math.min(Math.max(failures - 1, 0), RETRY_DELAYS.length - 1)]
}

/** MPD sends numbers as strings; normalise the ones the UI computes with. */
function normalise(data) {
  const num = (v) => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return {
    ...initial,
    ...data,
    elapsed: num(data.elapsed),
    duration: num(data.duration),
    // consume arrives as the string "0"/"1" (legacy bug: "0" was truthy)
    consume: data.consume === '1' || data.consume === 1 || data.consume === true,
    volume: normaliseVolume(data.volume),
    outputs: data.outputs || [],
    snapcast_clients: data.snapcast_clients || [],
    error: null,
  }
}

/** MPD omits `volume` (newer) or sends -1 (older) when there is no mixer. */
function normaliseVolume(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : null
}

function applyState(data) {
  failures = 0
  clearTimeout(snapshotRetry)
  mpd.set(normalise(data))
  // Seed the stream URL from the server default when the user hasn't set one.
  const c = get(config)
  if (data.default_stream && !c.stream && !c.stream_updated) {
    localStorage.setItem('stream', data.default_stream)
    config.update((x) => ({ ...x, stream: data.default_stream }))
  }
}

async function fetchJson(endpoint, signal) {
  const res = await fetch(apiUrl(endpoint), { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** One-off snapshot (/currentsong). */
export async function refreshCurrentSong() {
  try {
    applyState(await fetchJson('currentsong'))
  } catch (e) {
    mpd.update((s) => ({ ...s, error: e.message || String(e) }))
    // Keep trying with backoff even if the long poll is still hanging.
    failures++
    clearTimeout(snapshotRetry)
    if (running) snapshotRetry = setTimeout(refreshCurrentSong, retryDelay())
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    retryTimeout = setTimeout(resolve, ms)
  })
}

/** Long-poll loop (/poll_currentsong). Restarts itself after each response. */
async function pollLoop() {
  if (!running || pollInFlight) return
  pollInFlight = true
  try {
    while (running) {
      const sinceLast = Date.now() - lastPollStarted
      if (sinceLast < POLL_MIN_DELTA) await wait(POLL_MIN_DELTA - sinceLast)
      if (!running) break
      lastPollStarted = Date.now()
      abortController = new AbortController()
      try {
        applyState(await fetchJson('poll_currentsong', abortController.signal))
      } catch (e) {
        if (!running) break
        mpd.update((s) => ({ ...s, error: e.message || String(e) }))
        failures++
        lastPollStarted = 0 // don't add the 20 s poll spacing on top of the backoff
        // Also probe with a quick snapshot: it clears the banner as soon as the server answers,
        // instead of waiting for the next (possibly minutes-long) poll to return.
        clearTimeout(snapshotRetry)
        snapshotRetry = setTimeout(refreshCurrentSong, retryDelay())
        await wait(retryDelay())
      }
    }
  } finally {
    pollInFlight = false
  }
}

function onTick() {
  // Advance the elapsed timer locally while playing.
  mpd.update((s) => (s.state === 'play' ? { ...s, elapsed: s.elapsed + 1 } : s))
  // Watchdog: the long poll should have restarted within a minute.
  if (running && !pollInFlight && Date.now() - lastPollStarted > STALE_POLL_MS) pollLoop()
}

function onFocus() {
  if (!running) return
  if (get(mpd).error) {
    failures = 0 // restart the backoff at 1 s
    refreshCurrentSong()
  } else if (Date.now() - lastPollStarted > FOCUS_STALE_MS) {
    refreshCurrentSong()
  }
}

/** Start the snapshot + long-poll loop and the 1s elapsed ticker. Idempotent. */
export function startPolling() {
  if (running) return
  running = true
  refreshCurrentSong()
  pollLoop()
  timer = setInterval(onTick, 1000)
  window.addEventListener('focus', onFocus)
}

export function stopPolling() {
  running = false
  clearInterval(timer)
  clearTimeout(retryTimeout)
  clearTimeout(snapshotRetry)
  if (abortController) abortController.abort()
  window.removeEventListener('focus', onFocus)
}

/**
 * Send a playback command. play | pause | playpause | next | prev | stop.
 * Resets the poll spacing so the next poll isn't delayed, then takes a snapshot.
 */
export async function sendCommand(cmd) {
  lastPollStarted = 0
  try {
    await fetch(apiUrl(cmd))
  } catch (e) {
    mpd.update((s) => ({ ...s, error: e.message || String(e) }))
  }
  await refreshCurrentSong()
}

/** Enable/disable an MPD output. */
export async function toggleOutput(outputid) {
  await fetch(apiUrl('toggleoutput', { output: outputid }))
  await refreshCurrentSong()
}

/** Mute/unmute a Snapcast client. `muted` is the TARGET state. */
export async function toggleSnapcastClient(id, muted) {
  await fetch(apiUrl('togglesnapcastclient', { id, muted: String(muted) }))
  await refreshCurrentSong()
}

/** Set the MPD volume (0-100). Pass `final` on the last call of a drag to also refresh the state. */
export async function setVolume(value, final = true) {
  const v = Math.min(100, Math.max(0, Math.round(value)))
  mpd.update((s) => ({ ...s, volume: v }))
  try {
    await fetch(apiUrl('volume', { value: String(v) }))
  } catch (e) {
    mpd.update((s) => ({ ...s, error: e.message || String(e) }))
  }
  if (final) await refreshCurrentSong()
}
