<script>
  /**
   * Favourite toggle: outline bookmark = not saved, filled accent bookmark = favourite.
   * active: current state; ontoggle(): parent performs the add/remove call.
   * class: extra classes for positioning/background.
   */
  let { active = false, label = '', ontoggle, class: extra = '' } = $props()
</script>

<button
  type="button"
  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors
    {active ? 'text-accent-400' : 'text-ink-muted hover:text-ink'} {extra}"
  aria-pressed={active}
  aria-label={active ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
  title={active ? 'Remove from favourites' : 'Add to favourites'}
  onclick={(e) => {
    e.stopPropagation()
    ontoggle?.()
  }}
>
  <svg class="h-4 w-4" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
</button>
