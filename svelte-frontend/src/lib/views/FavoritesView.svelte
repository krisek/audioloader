<script>
  import { onMount } from 'svelte'
  import { fetchSpec, favourites } from '../stores/content.js'
  import ViewToggle from '../components/ui/ViewToggle.svelte'
  import MediaCollection from '../components/ui/MediaCollection.svelte'
  import EmptyState from '../components/ui/EmptyState.svelte'
  import LoadingSkeleton from '../components/ui/LoadingSkeleton.svelte'

  let items = $state([])
  let loading = $state(true)
  let error = $state('')

  onMount(async () => {
    try {
      items = await fetchSpec('favourites') // server already sends newest first
      favourites.set(new Set(items.map((i) => i.name)))
    } catch (e) {
      error = `Could not load favourites: ${e.message || e}`
    } finally {
      loading = false
    }
  })

  // Drop items un-favourited elsewhere in the app.
  let shown = $derived(items.filter((i) => $favourites.has(i.name)))
</script>

<div class="p-4">
  <div class="mb-4 flex items-center justify-between gap-3">
    <h2 class="text-xl font-semibold text-ink">Favorites</h2>
    <ViewToggle />
  </div>

  {#if error}
    <EmptyState tone="error" title="Couldn't load favourites" message={error} actionLabel="Try again" onaction={() => location.reload()} />
  {:else if loading}
    <LoadingSkeleton label="Loading favourites" />
  {:else if !shown.length}
    <EmptyState icon="bookmark" title="No favourites yet" message="Tap the bookmark on any album to save it here." />
  {:else}
    <MediaCollection items={shown} grouped={false} />
  {/if}
</div>
