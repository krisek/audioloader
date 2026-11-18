<script>
  import { viewPreference } from '../../stores/ui.js'

  /** Placeholder cards matching the grid/list layout so content doesn't shift when it arrives. */
  let { count = 8, label = 'Loading' } = $props()

  let isGrid = $derived($viewPreference === 'grid')
</script>

<div role="status" aria-live="polite" aria-busy="true">
  <span class="sr-only">{label}…</span>
  <div
    class={isGrid
      ? 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
      : 'flex flex-col gap-2'}
    aria-hidden="true"
  >
    {#each Array(count) as _, i (i)}
      {#if isGrid}
        <div class="animate-pulse overflow-hidden rounded-xl bg-surface-800">
          <div class="aspect-square w-full bg-surface-700"></div>
          <div class="space-y-2 p-3">
            <div class="h-3 w-3/4 rounded bg-surface-700"></div>
            <div class="h-2.5 w-1/2 rounded bg-surface-700"></div>
          </div>
        </div>
      {:else}
        <div class="flex animate-pulse items-center gap-3 rounded-lg bg-surface-800 p-2">
          <div class="h-9 w-9 shrink-0 rounded-md bg-surface-700"></div>
          <div class="flex-1 space-y-2">
            <div class="h-3 w-2/3 rounded bg-surface-700"></div>
            <div class="h-2.5 w-1/3 rounded bg-surface-700"></div>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
