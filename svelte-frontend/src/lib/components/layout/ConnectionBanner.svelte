<script>
  import { mpd, refreshCurrentSong } from '../../stores/mpd.js'

  let retrying = $state(false)

  // Only show the banner once the server has been unreachable for a while;
  // short blips (focus change, a single failed poll) reconnect silently.
  const SHOW_AFTER_MS = 8000
  let visible = $state(false)
  let hasError = $derived(Boolean($mpd.error))

  $effect(() => {
    if (!hasError) {
      visible = false
      return
    }
    const t = setTimeout(() => (visible = true), SHOW_AFTER_MS)
    return () => clearTimeout(t)
  })

  async function retry() {
    retrying = true
    await refreshCurrentSong()
    retrying = false
  }
</script>

{#if visible && hasError}
  <div
    class="flex shrink-0 items-center gap-3 border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm"
    role="alert"
  >
    <svg class="h-5 w-5 shrink-0 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
    <p class="min-w-0 flex-1 text-ink">
      <span class="font-semibold">Can't reach the music server.</span>
      <span class="text-ink-muted">Retrying automatically ({$mpd.error})</span>
    </p>
    <button
      type="button"
      class="min-h-touch shrink-0 rounded-lg bg-surface-600 px-4 font-medium text-ink hover:bg-surface-700 disabled:opacity-50"
      onclick={retry}
      disabled={retrying}
    >
      {retrying ? 'Retrying…' : 'Retry now'}
    </button>
  </div>
{/if}
