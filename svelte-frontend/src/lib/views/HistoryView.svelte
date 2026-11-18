<script>
  import { onMount } from 'svelte'
  import { fetchSpec, loadFavourites } from '../stores/content.js'
  import ViewToggle from '../components/ui/ViewToggle.svelte'
  import MediaCollection from '../components/ui/MediaCollection.svelte'
  import EmptyState from '../components/ui/EmptyState.svelte'
  import LoadingSkeleton from '../components/ui/LoadingSkeleton.svelte'

  let items = $state([])
  let loading = $state(true)
  let error = $state('')

  // Load history; on failure keep retrying with backoff 1,2,4,8,8... s (reset on success).
  onMount(() => {
    let stopped = false
    let timer
    async function load(attempt = 0) {
      try {
        // Favourites first so the heart flags are right (fixes the legacy race).
        await loadFavourites().catch(() => {})
        const list = await fetchSpec('history') // server already sends newest first
        if (stopped) return
        items = list
        error = ''
        loading = false
      } catch (e) {
        if (stopped) return
        error = `Could not load history: ${e.message || e}`
        loading = false
        timer = setTimeout(() => load(attempt + 1), Math.min(1000 * 2 ** attempt, 8000))
      }
    }
    load()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  })
</script>

<div class="p-4">
  <div class="mb-4 flex items-center justify-between gap-3">
    <h2 class="text-xl font-semibold text-ink">History</h2>
    <ViewToggle />
  </div>

  {#if error}
    <EmptyState tone="error" title="Couldn't load history" message={error} actionLabel="Try again" onaction={() => location.reload()} />
  {:else if loading}
    <LoadingSkeleton label="Loading history" />
  {:else if !items.length}
    <EmptyState icon="clock" title="History is empty" message="Albums you play will show up here." />
  {:else}
    <MediaCollection {items} grouped={false} />
  {/if}
</div>
