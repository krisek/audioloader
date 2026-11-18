<script>
  import { onMount, onDestroy } from 'svelte'
  import { config, setSetting } from '../stores/config.js'
  import { fetchDirectory, searchFolders, loadFavourites, toggleFavourite, favourites, baseName } from '../stores/content.js'
  import ViewToggle from '../components/ui/ViewToggle.svelte'
  import AddToQueueButton from '../components/ui/AddToQueueButton.svelte'
  import FavouriteButton from '../components/ui/FavouriteButton.svelte'
  import MediaCollection from '../components/ui/MediaCollection.svelte'
  import EmptyState from '../components/ui/EmptyState.svelte'
  import LoadingSkeleton from '../components/ui/LoadingSkeleton.svelte'

  let dir = $state($config.last_directory || '.')
  let dirs = $state([])
  let files = $state([])
  let loading = $state(true)
  let error = $state('')

  // Breadcrumb: root "." then each path segment.
  let crumbs = $derived.by(() => {
    const out = [{ name: '.', dir: '.' }]
    if (dir === '.') return out
    let acc = ''
    for (const part of dir.split('/').filter(Boolean)) {
      acc = acc ? `${acc}/${part}` : part
      out.push({ name: part, dir: acc })
    }
    return out
  })

  function fmt(sec) {
    const s = Math.round(sec)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = String(s % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
  }

  async function show(target) {
    loading = true
    error = ''
    try {
      const res = await fetchDirectory(target)
      dir = target
      dirs = res.dirs
      files = res.files
      setSetting('last_directory', target)
    } catch (e) {
      error = `Could not load "${target}": ${e.message || e}`
    } finally {
      loading = false
    }
  }

  async function togglecurrent() {
    try {
      await toggleFavourite(dir)
    } catch (e) {
      error = `Could not update favourite: ${e.message || e}`
    }
  }

  // Search: min 3 chars, 300 ms debounce, newest request wins (legacy rules).
  let query = $state('')
  let found = $state({ dirs: [], files: [] })
  let searching = $state(false)
  let searchError = $state('')
  let debounce = null
  let controller = null
  let searchActive = $derived(query.trim().length >= 3)

  function oninput() {
    clearTimeout(debounce)
    controller?.abort()
    searchError = ''
    const q = query.trim()
    if (q.length < 3) {
      searching = false
      return
    }
    searching = true
    debounce = setTimeout(async () => {
      controller = new AbortController()
      try {
        found = await searchFolders(q, controller.signal)
        searching = false
      } catch (e) {
        if (e.name === 'AbortError') return
        searchError = `Search failed: ${e.message || e}`
        searching = false
      }
    }, 300)
  }

  function clearSearch() {
    clearTimeout(debounce)
    controller?.abort()
    query = ''
    searching = false
    searchError = ''
  }

  // Opening a folder from a result leaves search mode.
  function openFound(name) {
    clearSearch()
    show(name)
  }

  onMount(() => {
    loadFavourites().catch(() => {})
    show(dir)
  })
  onDestroy(() => {
    clearTimeout(debounce)
    controller?.abort()
  })
</script>

<div class="p-4">
  <div class="mb-3 flex items-center gap-3">
    <input
      type="search"
      bind:value={query}
      {oninput}
      placeholder="Search folders and tracks (3+ characters)"
      aria-label="Search the music library"
      class="min-w-0 flex-1 h-touch min-h-touch rounded-lg border border-surface-600 bg-surface-800 px-4 text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none"
    />
    <ViewToggle />
  </div>

  {#if searchActive}
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="text-sm font-bold text-accent-400">Search results</h3>
      <button type="button" class="min-h-touch rounded px-3 text-sm text-ink-muted hover:text-ink" onclick={clearSearch}>
        Clear
      </button>
    </div>
    {#if searchError}
      <EmptyState tone="error" title="Search failed" message={searchError} />
    {:else if searching}
      <LoadingSkeleton count={4} label="Searching" />
    {:else if !found.dirs.length && !found.files.length}
      <EmptyState icon="search" title="Nothing found" message="Try a different search term." />
    {:else}
      {#if found.dirs.length}
        <MediaCollection items={found.dirs} onopen={openFound} />
      {:else}
        <!-- Track-only matches: show the tracks with the folder they live in. -->
        <ol class="divide-y divide-surface-700 rounded-lg bg-surface-800">
          {#each found.files as f (f.file)}
            <li class="flex min-w-0 items-center gap-3 px-3 py-2 text-sm">
              <button type="button" class="block min-w-0 flex-1 text-left" onclick={() => openFound(f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : '.')}>
                <span class="block truncate text-ink">{f.title}</span>
                <span class="block truncate text-xs text-ink-muted">{f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : ''}</span>
              </button>
              <AddToQueueButton file={f.file} />
            </li>
          {/each}
        </ol>
      {/if}
    {/if}
  {:else}
  <nav class="mb-4 flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
    {#each crumbs as c, i (c.dir)}
      {#if i > 0}<span class="text-ink-faint">/</span>{/if}
      <button
        type="button"
        class="min-h-touch rounded px-2 {i === crumbs.length - 1 ? 'font-semibold text-accent-400' : 'text-ink-muted hover:text-ink'}"
        onclick={() => show(c.dir)}
      >
        {c.name}
      </button>
    {/each}
    {#if dir !== '.'}
      <FavouriteButton class="ml-auto" active={$favourites.has(dir)} label={baseName(dir)} ontoggle={togglecurrent} />
    {/if}
  </nav>

  {#if error}
    <EmptyState tone="error" title="Couldn't load this folder" message={error} actionLabel="Try again" onaction={() => show(dir)} />
  {:else if loading}
    <LoadingSkeleton count={8} label="Loading folder" />
  {:else}
    {#if dirs.length}
      <MediaCollection items={dirs} onopen={show} />
    {/if}

    {#if files.length}
      {#if !dirs.length && dir !== '.'}
        <div class="mb-4 w-36 [&>div]:!grid-cols-1"><MediaCollection items={[{ name: dir, playtime: 0 }]} grouped={false} forceGrid onopen={() => {}} /></div>
      {/if}
      <div class="mt-6"></div>
      <ol class="divide-y divide-surface-700 rounded-lg bg-surface-800">
        {#each files as f (f.file)}
          <li class="flex items-center gap-3 px-3 py-2 text-sm">
            <span class="w-8 shrink-0 text-right text-ink-faint">{f.track}</span>
            <span class="min-w-0 flex-1 truncate text-ink">{f.title}</span>
            <span class="shrink-0 text-ink-muted">{f.duration ? fmt(f.duration) : ''}</span>
            <AddToQueueButton file={f.file} />
          </li>
        {/each}
      </ol>
    {/if}

    {#if !dirs.length && !files.length}
      <EmptyState icon="folder" title="This folder is empty" message="No albums or tracks were found here." />
    {/if}
  {/if}
  {/if}
</div>
