<script>
  import { onMount } from 'svelte'
  import { mpd } from '../stores/mpd.js'
  import { fetchBandcampHistory, lookupBandcamp, removeStreamHistory } from '../stores/content.js'
  import ViewToggle from '../components/ui/ViewToggle.svelte'
  import StreamCollection from '../components/ui/StreamCollection.svelte'
  import EmptyState from '../components/ui/EmptyState.svelte'
  import LoadingSkeleton from '../components/ui/LoadingSkeleton.svelte'

  let history = $state([])
  let loading = $state(true)
  let error = $state('')

  let url = $state('')
  let found = $state(null)
  let looking = $state(false)
  let lookupError = $state('')

  async function loadHistory() {
    try {
      history = await fetchBandcampHistory()
      error = ''
    } catch (e) {
      error = `Could not load Bandcamp history: ${e.message || e}`
    } finally {
      loading = false
    }
  }

  onMount(loadHistory)

  // The server only resolves URLs of 20+ characters that are Bandcamp or YouTube links.
  async function lookup(e) {
    e.preventDefault()
    const pattern = url.trim()
    found = null
    lookupError = ''
    if (!/bandcamp\.com\/|youtube|youtu\.be/.test(pattern) || pattern.length < 20) {
      lookupError = 'Paste a Bandcamp album or YouTube URL.'
      return
    }
    looking = true
    try {
      found = await lookupBandcamp(pattern)
      if (!found) lookupError = 'Nothing found at that URL.'
    } catch (err) {
      lookupError = `Lookup failed: ${err.message || err}`
    } finally {
      looking = false
    }
  }

  async function remove(item) {
    try {
      await removeStreamHistory(item)
      await loadHistory()
    } catch (e) {
      error = `Could not remove: ${e.message || e}`
    }
  }

  function played() {
    found = null
    url = ''
    loadHistory()
  }
</script>

<div class="p-4">
  {#if !$mpd.bandcamp_enabled}
    <p class="mb-4 rounded-lg bg-surface-800 p-3 text-sm text-warn">
      Bandcamp is disabled on this server (AL_BANDCAMP_ENABLED). Adding new albums may not work.
    </p>
  {/if}

  <div class="mb-4 flex items-center gap-3">
  <form onsubmit={lookup} class="flex min-w-0 flex-1 gap-2">
    <input
      type="url"
      bind:value={url}
      placeholder="Paste a Bandcamp album or YouTube URL"
      aria-label="Bandcamp or YouTube URL"
      class="h-touch min-h-touch min-w-0 flex-1 rounded-lg border border-surface-600 bg-surface-800 px-4 text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none"
    />
    <button
      type="submit"
      disabled={looking}
      aria-label="Look up URL"
      title="Look up URL"
      class="h-touch min-h-touch shrink-0 rounded-lg bg-accent-500 px-4 font-semibold text-surface-950 hover:bg-accent-400 disabled:opacity-50"
    >
      {#if looking}
        <span class="text-sm">…</span>
      {:else}
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      {/if}
    </button>
  </form>
  <ViewToggle />
</div>

  {#if lookupError}
    <p class="mb-4 text-sm text-danger" role="alert">{lookupError}</p>
  {/if}
  {#if found}
    <div class="mb-6">
      <StreamCollection items={[found]} onplayed={played} />
    </div>
  {/if}

  <h3 class="mb-2 border-b border-surface-600 pb-1 text-sm font-bold text-accent-400">History</h3>
  {#if error}
    <EmptyState tone="error" title="Couldn't load Bandcamp history" message={error} actionLabel="Try again" onaction={loadHistory} />
  {:else if loading}
    <LoadingSkeleton count={4} label="Loading Bandcamp history" />
  {:else if !history.length}
    <EmptyState icon="disc" title="No Bandcamp albums yet" message="Paste an album or YouTube URL above to play it." />
  {:else}
    <StreamCollection items={history} onremove={remove} onplayed={loadHistory} />
  {/if}
</div>
