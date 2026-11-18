<script>
  import { viewPreference } from '../../stores/ui.js'
  import { favourites, groupItems, playDirectory, toggleFavourite } from '../../stores/content.js'
  import { setSetting } from '../../stores/config.js'
  import { setView } from '../../stores/nav.js'
  import MediaItem from './MediaItem.svelte'
  import PlayVerification from './PlayVerification.svelte'

  /**
   * items: [{ name, playhours, playtime, songs }]
   * grouped: true -> alphabetical sections (same for grid and list); false -> server order
   * onopen(name): open a folder (Folders view only)
   */
  let { items = [], grouped = true, onopen, forceGrid = false } = $props()

  let groups = $derived(grouped ? groupItems(items) : [{ initial: '', items }])
  let isGrid = $derived(forceGrid || $viewPreference === 'grid')
  let pending = $state(null)
  let status = $state('')

  // Title click: open the folder. In Folders that navigates in place; elsewhere it jumps to Folders.
  function openFolder(name) {
    if (onopen) onopen(name)
    else {
      setSetting('last_directory', name)
      setView('folders')
    }
  }

  // Legacy cover rule: under 2 h is probably one album -> confirm play; otherwise open the folder.
  function pressCover(name) {
    const it = items.find((i) => i.name === name)
    if (it && it.playtime >= 7200) openFolder(name)
    else pending = { name }
  }

  async function togglefav(name) {
    try {
      await toggleFavourite(name)
      status = ''
    } catch (e) {
      status = `Could not update favourite: ${e.message || e}`
    }
  }

  async function confirm({ item }) {
    pending = null
    try {
      await playDirectory(item.name)
      status = ''
    } catch (e) {
      status = `Could not play: ${e.message || e}`
    }
  }
</script>

{#if status}
  <p class="mb-3 text-sm text-danger" role="alert">{status}</p>
{/if}

{#each groups as group (group.initial)}
  {#if group.initial}
    <h3 class="mb-2 mt-4 border-b border-surface-600 pb-1 text-sm font-bold text-accent-400 first:mt-0">
      {group.initial}
    </h3>
  {/if}
  <div
    class={isGrid
      ? 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
      : 'flex flex-col gap-2'}
  >
    {#each group.items as it (it.name)}
      <MediaItem
        name={it.name}
        favourite={$favourites.has(it.name)}
        onplay={(n) => (pending = { name: n })}
        onopen={openFolder}
        oncover={pressCover}
        ontogglefav={togglefav}
        {forceGrid}
      />
    {/each}
  </div>
{/each}

<PlayVerification item={pending} onconfirm={confirm} oncancel={() => (pending = null)} />
