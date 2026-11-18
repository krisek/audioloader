<script>
  import SnapcastMenu from './SnapcastMenu.svelte'
  import VolumeMenu from './VolumeMenu.svelte'
  import { mpd, sendCommand } from '../../stores/mpd.js'

  // Play/pause follows the legacy rule: send `next_state` ('play' | 'pause'),
  // which the server omits when stopped -> fall back to 'play'.
  let command = $derived($mpd.next_state || 'play')
  let playing = $derived($mpd.state === 'play')

  let percent = $derived(
    $mpd.duration > 0 ? Math.min(100, Math.max(0, ($mpd.elapsed / $mpd.duration) * 100)) : 0
  )

  function fmt(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = String(s % 60).padStart(2, '0')
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
  }

  const btn =
    'flex h-touch min-h-touch w-touch min-w-touch shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-700 active:bg-surface-600 disabled:opacity-40'
</script>

<section
  aria-label="Now playing"
  class="relative shrink-0 border-t border-surface-700 bg-surface-800"
>
  <!-- Progress bar (visual; updated from elapsed/duration) -->
  <div
    class="h-1 w-full bg-surface-600"
    role="progressbar"
    aria-label="Track progress"
    aria-valuemin="0"
    aria-valuemax={Math.round($mpd.duration)}
    aria-valuenow={Math.round($mpd.elapsed)}
  >
    <div class="h-full bg-accent-400 transition-[width] duration-700 ease-linear" style="width: {percent}%"></div>
  </div>

  <div class="flex items-center gap-2 px-3 py-1">
    <!-- Metadata -->
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-ink">{$mpd.display_title || 'not playing'}</p>
      <p class="truncate text-xs text-ink-muted">
        {$mpd.display_title_top || '\u00a0'}
      </p>
      {#if $mpd.active && $mpd.duration > 0}
        <p class="text-[10px] tabular-nums text-ink-faint">
          {fmt($mpd.elapsed)} / {fmt($mpd.duration)}
        </p>
      {/if}
    </div>

    <!-- Controls -->
    <div class="flex shrink-0 items-center">
      <VolumeMenu />
      <SnapcastMenu />
      <button type="button" class="{btn} hidden sm:flex" onclick={() => sendCommand('prev')} aria-label="Previous">
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 6h2v12H6zM9.5 12 18 18V6z" />
        </svg>
      </button>

      <button type="button" class="{btn}" onclick={() => sendCommand('stop')} aria-label="Stop" disabled={!$mpd.active}>
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 7h10v10H7z" />
        </svg>
      </button>

      <button
        type="button"
        class="{btn} bg-accent-500 text-surface-950 hover:bg-accent-400"
        onclick={() => sendCommand(command)}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {#if playing}
          <svg class="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        {:else}
          <svg class="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        {/if}
      </button>

      <button type="button" class={btn} onclick={() => sendCommand('next')} aria-label="Next">
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />
        </svg>
      </button>
    </div>
  </div>
</section>
