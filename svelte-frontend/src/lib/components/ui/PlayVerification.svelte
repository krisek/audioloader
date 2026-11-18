<script>
  import { config, apiUrl } from '../../stores/config.js'
  import { baseName } from '../../stores/ui.js'
  import { focusTrap } from '../../actions/focusTrap.js'

  /**
   * item: null (hidden) or { name, url?, stationuuid?, favicon? }
   * onconfirm({ item })
   * oncancel()
   */
  let { item = null, onconfirm, oncancel } = $props()

  let imgFailed = $state(false)

  $effect(() => {
    item // reset whenever a different item is opened
    imgFailed = false
  })

  let cover = $derived(
    item && $config.loaded
      ? item.favicon || (item.url ? '' : apiUrl('cover', { directory: item.name }))
      : ''
  )

  function confirm() {
    onconfirm?.({ item })
  }

  function onKey(e) {
    if (item && e.key === 'Escape') oncancel?.()
  }
</script>

<svelte:window onkeydown={onKey} />

{#if item}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    onclick={(e) => e.target === e.currentTarget && oncancel?.()}
  >
    <div
      class="w-full max-w-sm rounded-2xl border border-surface-600 bg-surface-800 p-5 shadow-xl"
      role="dialog"
      aria-modal="true"
      use:focusTrap
      aria-labelledby="pv-title"
    >
      {#if cover && !imgFailed}
        <img
          src={cover}
          alt=""
          class="mx-auto mb-4 aspect-square w-32 rounded-lg bg-surface-700 object-cover"
          onerror={() => (imgFailed = true)}
        />
      {/if}

      <h2 id="pv-title" class="mb-1 break-words text-center text-lg font-semibold text-ink">
        Play {item.url ? item.name : baseName(item.name)}?
      </h2>
      <p class="mb-4 truncate text-center text-xs text-ink-faint" title={item.url || item.name}>
        {item.url ? item.subtitle || item.url : item.name}
      </p>

      <div class="flex gap-3">
        <button
          type="button"
          class="h-touch min-h-touch flex-1 rounded-lg bg-surface-600 font-medium text-ink hover:bg-surface-700"
          onclick={() => oncancel?.()}
        >
          Cancel
        </button>
        <!-- svelte-ignore a11y_autofocus -->
        <button
          type="button"
          autofocus
          class="h-touch min-h-touch flex-1 rounded-lg bg-accent-500 font-semibold text-surface-950 hover:bg-accent-400"
          onclick={confirm}
        >
          Yes
        </button>
      </div>
    </div>
  </div>
{/if}
