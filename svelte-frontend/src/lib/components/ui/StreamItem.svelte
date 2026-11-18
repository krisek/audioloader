<script>
  import { viewPreference } from '../../stores/ui.js'

  /**
   * item: { key, kind: 'radio'|'bandcamp', name, subtitle, favicon, url }
   * onplay(item): parent opens PlayVerification, then plays
   * onremove(item): optional, removes a history entry
   */
  let { item, onplay, onremove } = $props()

  let imgFailed = $state(false)
  let isGrid = $derived($viewPreference === 'grid')
  let tip = $derived(item.subtitle ? `${item.subtitle} — ${item.name}` : item.name)
  let cover = $derived(item.favicon && /^https?:\/\//.test(item.favicon) ? item.favicon : '')
</script>

{#snippet art(sizeClass)}
  {#if cover && !imgFailed}
    <img
      src={cover}
      alt=""
      title={tip}
      loading="lazy"
      referrerpolicy="no-referrer"
      class="{sizeClass} bg-surface-700 object-cover"
      onerror={() => (imgFailed = true)}
    />
  {:else}
    <div class="{sizeClass} flex items-center justify-center bg-surface-700 text-ink-faint" aria-hidden="true">
      <svg class="h-1/3 w-1/3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        {#if item.kind === 'radio'}
          <path d="M4 9h16v11H4zM8 9l9-6M8 14h.01M8 17h8" />
        {:else}
          <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
        {/if}
      </svg>
    </div>
  {/if}
{/snippet}

{#snippet playButton()}
  <button
    type="button"
    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500 text-surface-950 shadow transition-colors hover:bg-accent-400"
    aria-label="Play {item.name}"
    onclick={() => onplay?.(item)}
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
  </button>
{/snippet}

{#snippet removeButton(extra)}
  {#if onremove}
    <button
      type="button"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-danger {extra}"
      aria-label="Remove {item.name} from history"
      title="Remove from history"
      onclick={() => onremove(item)}
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  {/if}
{/snippet}

{#if isGrid}
  <article class="flex flex-col overflow-hidden rounded-xl bg-surface-800 transition-colors hover:bg-surface-700">
    <div class="relative">
      <button type="button" class="block w-full" aria-label="Play {item.name}" title={tip} onclick={() => onplay?.(item)}>
        {@render art('aspect-square w-full')}
      </button>
      <div class="absolute bottom-1.5 right-1.5 flex items-center gap-1.5">
        {@render removeButton('bg-black/60 text-white hover:bg-black/80')}
        {@render playButton()}
      </div>
    </div>
    <div class="min-w-0 p-3">
      <p class="truncate text-sm font-medium text-ink" title={tip}>{item.name}</p>
      <p class="truncate text-xs text-ink-muted" title={tip}>{item.subtitle || '\u00a0'}</p>
    </div>
  </article>
{:else}
  <article class="flex min-h-touch items-center gap-3 rounded-lg bg-surface-800 p-2 transition-colors hover:bg-surface-700">
    <button type="button" class="shrink-0 overflow-hidden rounded-md" aria-label="Play {item.name}" title={tip} onclick={() => onplay?.(item)}>
      {@render art('h-9 w-9')}
    </button>
    <button type="button" class="min-h-touch min-w-0 flex-1 text-left" onclick={() => onplay?.(item)}>
      <p class="truncate text-sm font-medium text-ink" title={tip}>{item.name}</p>
      <p class="truncate text-xs text-ink-muted" title={tip}>{item.subtitle || '\u00a0'}</p>
    </button>
    {@render removeButton('')}
    {@render playButton()}
  </article>
{/if}
