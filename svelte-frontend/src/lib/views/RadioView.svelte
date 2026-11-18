<script>
  import { onMount, onDestroy } from 'svelte'
  import { fetchRadioHistory, searchRadio, removeStreamHistory } from '../stores/content.js'
  import ViewToggle from '../components/ui/ViewToggle.svelte'
  import StreamCollection from '../components/ui/StreamCollection.svelte'
  import EmptyState from '../components/ui/EmptyState.svelte'
  import LoadingSkeleton from '../components/ui/LoadingSkeleton.svelte'

  let recent = $state([])
  let results = $state([])
  let query = $state('')
  let loading = $state(true)
  let searching = $state(false)
  let error = $state('')
  let searchError = $state('')

  let debounce = null
  let controller = null

  async function loadRecent() {
    try {
      recent = await fetchRadioHistory()
      error = ''
    } catch (e) {
      error = `Could not load recent stations: ${e.message || e}`
    } finally {
      loading = false
    }
  }

  onMount(loadRecent)
  onDestroy(() => {
    clearTimeout(debounce)
    controller?.abort()
  })

  // Legacy search rules: min 3 chars, 300 ms debounce, latest request wins.
  function oninput() {
    clearTimeout(debounce)
    controller?.abort()
    const q = query.trim()
    searchError = ''
    if (q.length < 3) {
      results = []
      searching = false
      return
    }
    searching = true
    debounce = setTimeout(async () => {
      controller = new AbortController()
      try {
        results = await searchRadio(q, controller.signal)
        searching = false
      } catch (e) {
        if (e.name === 'AbortError') return
        searchError = `Search failed: ${e.message || e}`
        searching = false
      }
    }, 300)
  }

  async function remove(item) {
    try {
      await removeStreamHistory(item)
      await loadRecent()
    } catch (e) {
      error = `Could not remove: ${e.message || e}`
    }
  }
</script>

<div class="p-4">
  <div class="mb-4 flex items-center gap-3">
    <input
      type="search"
      bind:value={query}
      {oninput}
      placeholder="Search radio stations (3+ characters)"
      aria-label="Search radio stations"
      class="min-w-0 flex-1 h-touch min-h-touch rounded-lg border border-surface-600 bg-surface-800 px-4 text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none"
    />
    <ViewToggle />
  </div>

  {#if query.trim().length >= 3}
    <h3 class="mb-2 border-b border-surface-600 pb-1 text-sm font-bold text-accent-400">Results</h3>
    {#if searchError}
      <p class="mb-3 text-sm text-danger" role="alert">{searchError}</p>
    {:else if searching}
      <div class="mb-6"><LoadingSkeleton count={4} label="Searching" /></div>
    {:else if !results.length}
      <div class="mb-6"><EmptyState icon="search" title="No stations found" message="Try a different search term." /></div>
    {:else}
      <div class="mb-6">
        <StreamCollection items={results} onplayed={loadRecent} />
      </div>
    {/if}
  {/if}

  <h3 class="mb-2 border-b border-surface-600 pb-1 text-sm font-bold text-accent-400">Recent stations</h3>
  {#if error}
    <EmptyState tone="error" title="Couldn't load recent stations" message={error} actionLabel="Try again" onaction={loadRecent} />
  {:else if loading}
    <LoadingSkeleton count={4} label="Loading recent stations" />
  {:else if !recent.length}
    <EmptyState icon="radio" title="No stations played yet" message="Search above to find a station." />
  {:else}
    <StreamCollection items={recent} onremove={remove} onplayed={loadRecent} />
  {/if}
</div>
