<script>
  import { onMount } from 'svelte'
  import { fetchSpec, loadFavourites, generateRandomSet } from '../stores/content.js'
  import ViewToggle from '../components/ui/ViewToggle.svelte'
  import MediaCollection from '../components/ui/MediaCollection.svelte'
  import EmptyState from '../components/ui/EmptyState.svelte'
  import LoadingSkeleton from '../components/ui/LoadingSkeleton.svelte'

  let items = $state([])
  let loading = $state(true)
  let error = $state('')

  async function load() {
    loading = true
    error = ''
    try {
      await loadFavourites().catch(() => {})
      items = await fetchSpec('randomset')
    } catch (e) {
      error = `Could not load random albums: ${e.message || e}`
    } finally {
      loading = false
    }
  }

  async function shuffle() {
    loading = true
    error = ''
    try {
      await generateRandomSet()
      await load()
    } catch (e) {
      error = `Could not generate a new set: ${e.message || e}`
      loading = false
    }
  }

  onMount(load)
</script>

<div class="p-4">
  <div class="mb-4 flex items-center justify-between gap-3">
    <button
      type="button"
      class="h-touch min-h-touch rounded-full bg-accent-500 px-6 font-semibold text-surface-950 hover:bg-accent-400 disabled:opacity-50"
      onclick={shuffle}
      disabled={loading}
    >
      Shuffle a new set
    </button>
    <ViewToggle />
  </div>

  {#if error}
    <EmptyState tone="error" title="Couldn't load random albums" message={error} actionLabel="Try again" onaction={load} />
  {:else if loading}
    <LoadingSkeleton count={12} label="Loading random albums" />
  {:else if !items.length}
    <EmptyState icon="disc" title="No albums in the set" message="Try shuffling a new set." actionLabel="Shuffle a new set" onaction={shuffle} />
  {:else}
    <MediaCollection {items} grouped={false} />
  {/if}
</div>
