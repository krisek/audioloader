<script>
  import { viewPreference } from '../../stores/ui.js'
  import { playStream } from '../../stores/content.js'
  import StreamItem from './StreamItem.svelte'
  import PlayVerification from './PlayVerification.svelte'

  /**
   * items: StreamItem[] (shown in the given order)
   * onremove(item): optional; history lists pass it
   * onplayed(item): called after /addplay succeeded
   */
  let { items = [], onremove, onplayed } = $props()

  let isGrid = $derived($viewPreference === 'grid')
  let pending = $state(null)
  let status = $state('')

  async function confirm({ item }) {
    pending = null
    try {
      await playStream(item)
      status = ''
      onplayed?.(item)
    } catch (e) {
      status = `Could not play: ${e.message || e}`
    }
  }
</script>

{#if status}
  <p class="mb-3 text-sm text-danger" role="alert">{status}</p>
{/if}

<div
  class={isGrid
    ? 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
    : 'flex flex-col gap-2'}
>
  {#each items as it (it.key)}
    <StreamItem item={it} onplay={(i) => (pending = i)} {onremove} />
  {/each}
</div>

<PlayVerification item={pending} onconfirm={confirm} oncancel={() => (pending = null)} />
