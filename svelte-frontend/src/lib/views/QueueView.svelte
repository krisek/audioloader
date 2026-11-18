<script>
  import { onMount } from 'svelte'
  import { mpd } from '../stores/mpd.js'
  import { fetchQueue, queueAction, baseName } from '../stores/content.js'
  import EmptyState from '../components/ui/EmptyState.svelte'
  import LoadingSkeleton from '../components/ui/LoadingSkeleton.svelte'

  let queue = $state([])
  let currentId = $state('')
  let loading = $state(true)
  let error = $state('')

  async function load() {
    try {
      const res = await fetchQueue()
      queue = res.queue
      currentId = res.current_id
      error = ''
    } catch (e) {
      error = `Could not load the queue: ${e.message || e}`
    } finally {
      loading = false
    }
  }

  async function act(action, id) {
    try {
      await queueAction(action, id)
    } catch (e) {
      error = e.message || String(e)
    }
    await load()
  }

  // Reload when the playing track or state changes (consume shrinks the queue as tracks finish).
  let key = $derived(`${$mpd.state}|${$mpd.display_title}`)
  let mounted = false
  $effect(() => {
    key
    if (mounted) load()
  })
  onMount(() => {
    mounted = true
    load()
  })

  function fmt(sec) {
    const s = Math.round(sec)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
</script>

<div class="p-4">
  <div class="mb-4 flex items-center justify-between gap-3">
    <h2 class="text-xl font-semibold text-ink">Queue</h2>
    {#if queue.length > 1 || (queue.length === 1 && !currentId)}
      <button type="button" class="rounded-lg border border-surface-600 px-3 py-1.5 text-sm text-ink-muted hover:text-ink" onclick={() => act('queue_clear')}>Clear</button>
    {/if}
  </div>

  {#if error}
    <EmptyState tone="error" title="Queue problem" message={error} actionLabel="Try again" onaction={load} />
  {:else if loading}
    <LoadingSkeleton label="Loading queue" />
  {:else if !queue.length}
    <EmptyState icon="disc" title="The queue is empty" message="Add tracks with the + button in a folder." />
  {:else}
    <ol class="divide-y divide-surface-700 rounded-lg bg-surface-800">
      {#each queue as q (q.id)}
        {@const current = q.id === currentId}
        <li class="flex items-center gap-3 px-3 py-2 text-sm {current ? 'text-accent-400' : 'text-ink'}">
          <button type="button" class="min-w-0 flex-1 text-left" onclick={() => act('queue_play', q.id)} aria-label="Play {q.title || baseName(q.file)}">
            <span class="block truncate">{q.title || baseName(q.file)}</span>
            <span class="block truncate text-xs text-ink-muted">{[q.artist, q.album].filter(Boolean).join(' · ') || q.file}</span>
          </button>
          <span class="shrink-0 text-ink-muted">{q.duration ? fmt(q.duration) : ''}</span>
          <button type="button" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-danger" onclick={() => act('queue_remove', q.id)} aria-label="Remove from queue">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>
