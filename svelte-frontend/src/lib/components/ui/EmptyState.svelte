<script>
  /**
   * Friendly placeholder for "nothing here" and "something failed".
   * tone: 'empty' | 'error'
   * title, message: text; actionLabel + onaction: optional button (e.g. Retry)
   * icon: 'folder' | 'bookmark' | 'clock' | 'radio' | 'disc' | 'search' | 'alert'
   */
  let { tone = 'empty', icon = 'folder', title = '', message = '', actionLabel = '', onaction } = $props()

  const paths = {
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    radio: 'M4 9h16v11H4zM8 9l9-6M8 14h.01M8 17h8',
    disc: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
    search: 'M21 21l-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  }
  let isError = $derived(tone === 'error')
</script>

<div
  class="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center
    {isError ? 'border-danger/40 bg-danger/5' : 'border-surface-600 bg-surface-900'}"
  role={isError ? 'alert' : 'status'}
>
  <svg
    class="mb-3 h-10 w-10 {isError ? 'text-danger' : 'text-ink-faint'}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={paths[isError ? 'alert' : icon] ?? paths.folder} />
  </svg>
  <p class="text-base font-semibold text-ink">{title}</p>
  {#if message}<p class="mt-1 max-w-md break-words text-sm text-ink-muted">{message}</p>{/if}
  {#if actionLabel && onaction}
    <button
      type="button"
      class="mt-4 h-touch min-h-touch rounded-lg bg-surface-600 px-5 font-medium text-ink hover:bg-surface-700"
      onclick={() => onaction()}
    >
      {actionLabel}
    </button>
  {/if}
</div>
