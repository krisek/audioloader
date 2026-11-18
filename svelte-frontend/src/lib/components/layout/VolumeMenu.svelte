<script>
  import { mpd, setVolume } from '../../stores/mpd.js'

  const SEND_EVERY_MS = 120 // slider drags are sent at most this often

  let open = $state(false)
  let root = $state()
  let dragging = $state(false)
  let local = $state(0)
  let lastSent = 0

  let volume = $derived($mpd.volume)
  let shown = $derived(dragging ? local : (volume ?? 0))

  function onInput(e) {
    dragging = true
    local = Number(e.currentTarget.value)
    const now = Date.now()
    if (now - lastSent >= SEND_EVERY_MS) {
      lastSent = now
      setVolume(local, false)
    }
  }

  async function onChange(e) {
    local = Number(e.currentTarget.value)
    lastSent = 0
    await setVolume(local, true)
    dragging = false
  }

  function onKey(e) {
    if (open && e.key === 'Escape') open = false
  }

  function onDocClick(e) {
    if (open && root && !root.contains(e.target)) open = false
  }
</script>

<svelte:window onkeydown={onKey} onclick={onDocClick} />

{#if volume !== null}
  <div class="shrink-0 sm:relative" bind:this={root}>
    <button
      type="button"
      class="flex h-touch min-h-touch w-touch min-w-touch items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-700 hover:text-ink"
      aria-label="Volume {volume}%"
      aria-haspopup="true"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        {#if volume > 0}<path d="M15.5 8.5a5 5 0 0 1 0 7" />{/if}
        {#if volume > 50}<path d="M18.5 5.5a9 9 0 0 1 0 13" />{/if}
      </svg>
    </button>

    {#if open}
      <div class="absolute bottom-full left-2 right-2 z-40 mb-1 rounded-xl border border-surface-600 bg-surface-800 p-3 text-ink shadow-xl sm:left-auto sm:right-0 sm:mb-2 sm:w-64" style="color: rgb(var(--ink))">
        <label class="flex items-center gap-3 text-sm">
          <span class="w-16 shrink-0 text-xs text-ink-faint">Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={shown}
            class="h-touch min-h-touch w-full accent-accent-400"
            aria-label="MPD volume"
            oninput={onInput}
            onchange={onChange}
          />
          <span class="w-9 shrink-0 text-right tabular-nums">{shown}</span>
        </label>
      </div>
    {/if}
  </div>
{/if}
