<script>
  import { config, apiUrl } from '../../stores/config.js'
  import { viewPreference, baseName } from '../../stores/ui.js'
  import FavouriteButton from './FavouriteButton.svelte'

  /**
   * name: full folder path (identity key, also used for /cover)
   * favourite: bookmark state; ontogglefav(name) adds/removes the favourite
   * onplay(name): parent opens PlayVerification, then does the MPD call
   * onopen(name): title click -> open the folder
   * oncover(name): cover click (legacy rule: short = confirm play, long = open); defaults to onopen
   */
  let { name, favourite = false, onplay, onopen, oncover, ontogglefav, forceGrid = false } = $props()

  let title = $derived(baseName(name))
  let parent = $derived(name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '')
  let cover = $derived($config.loaded ? apiUrl('cover', { directory: name }) : '')
  // Hover text: "Artist — Album" (the parent path is the artist)
  let tip = $derived(parent ? `${parent.split('/').join(' / ')} — ${title}` : title)
  let imgFailed = $state(false)
  let isGrid = $derived(forceGrid || $viewPreference === 'grid')
</script>

{#snippet art(sizeClass)}
  {#if cover && !imgFailed}
    <img
      src={cover}
      alt=""
      title={tip}
      loading="lazy"
      class="{sizeClass} bg-surface-700 object-cover"
      onerror={() => (imgFailed = true)}
    />
  {:else}
    <div class="{sizeClass} flex items-center justify-center bg-surface-700 text-ink-faint" aria-hidden="true">
      <svg class="h-1/3 w-1/3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      </svg>
    </div>
  {/if}
{/snippet}

{#snippet bookmark(extra)}
  <FavouriteButton active={favourite} label={title} class={extra} ontoggle={() => ontogglefav?.(name)} />
{/snippet}

{#snippet playButton(extra)}
  <button
    type="button"
    class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-500 text-surface-950 shadow transition-colors hover:bg-accent-400 {extra}"
    aria-label="Play {title}"
    title="Play {tip}"
    onclick={() => onplay?.(name)}
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
  </button>
{/snippet}

{#if isGrid}
  <!-- Grid: vertical card -->
  <article class="group flex flex-col overflow-hidden rounded-xl bg-surface-800 transition-colors hover:bg-surface-700">
    <div class="relative">
      <button type="button" class="block w-full" aria-label="Open {title}" title={tip} onclick={() => (oncover ?? onopen)?.(name)}>
        {@render art('aspect-square w-full')}
      </button>
      <div class="absolute bottom-1.5 right-1.5 flex items-center gap-1.5">
        {@render bookmark('bg-black/60 hover:bg-black/80')}
        {@render playButton('')}
      </div>
    </div>
    <div class="min-w-0 p-3">
      <button type="button" class="block w-full text-left" title={tip} onclick={() => onopen?.(name)}>
        <span class="block truncate text-sm font-medium text-ink hover:text-accent-400" title={tip}>
          {title}
        </span>
      </button>
      <p class="truncate text-xs text-ink-muted" title={tip}>{parent || '\u00a0'}</p>
    </div>
  </article>
{:else}
  <!-- List: horizontal row -->
  <article class="flex items-center gap-3 rounded-lg bg-surface-800 p-2 transition-colors hover:bg-surface-700">
    <button type="button" class="shrink-0 overflow-hidden rounded-md" aria-label="Open {title}" title={tip} onclick={() => (oncover ?? onopen)?.(name)}>
      {@render art('h-9 w-9')}
    </button>
    <button type="button" class="min-w-0 flex-1 text-left" title={tip} onclick={() => onopen?.(name)}>
      <p class="truncate text-sm font-medium text-ink" title={tip}>
        {title}
      </p>
      <p class="truncate text-xs text-ink-muted" title={tip}>{parent || '\u00a0'}</p>
    </button>
    {@render bookmark('')}
    {@render playButton('')}
  </article>
{/if}
