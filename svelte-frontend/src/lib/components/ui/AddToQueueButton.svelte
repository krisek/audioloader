<script>
  import { enqueueFile } from '../../stores/content.js'

  // Small circled + that appends one file to the queue. Shows a check for a moment when done.
  let { file } = $props()
  let state = $state('idle') // idle | busy | done | error

  async function add() {
    if (state === 'busy') return
    state = 'busy'
    try {
      await enqueueFile(file)
      state = 'done'
    } catch {
      state = 'error'
    }
    setTimeout(() => (state = 'idle'), 1500)
  }
</script>

<button
  type="button"
  onclick={add}
  aria-label="Add to queue"
  title={state === 'error' ? 'Could not add' : 'Add to queue'}
  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors
    {state === 'done' ? 'border-accent-400 text-accent-400' : state === 'error' ? 'border-danger text-danger' : 'border-surface-600 text-ink-muted hover:border-accent-400 hover:text-accent-400'}"
>
  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={state === 'done' ? 'M5 13l4 4L19 7' : state === 'error' ? 'M6 6l12 12M18 6 6 18' : 'M12 5v14M5 12h14'} />
  </svg>
</button>
