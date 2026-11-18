<script>
  import { viewPreference } from '../../stores/ui.js'

  const base =
    'flex h-touch min-h-touch w-touch min-w-touch items-center justify-center transition-colors'
</script>

<div
  class="inline-flex overflow-hidden rounded-lg border border-surface-600 bg-surface-800"
  role="group"
  aria-label="Layout"
>
  <button
    type="button"
    class="{base} {$viewPreference === 'list' ? 'bg-surface-600 text-accent-400' : 'text-ink-muted hover:text-ink'}"
    aria-label="List view"
    aria-pressed={$viewPreference === 'list'}
    onclick={() => viewPreference.set('list')}
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  </button>
  <button
    type="button"
    class="{base} {$viewPreference === 'grid' ? 'bg-surface-600 text-accent-400' : 'text-ink-muted hover:text-ink'}"
    aria-label="Grid view"
    aria-pressed={$viewPreference === 'grid'}
    onclick={() => viewPreference.set('grid')}
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  </button>
</div>
