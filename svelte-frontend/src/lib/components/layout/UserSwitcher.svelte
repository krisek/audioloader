<script>
  import { config, setSetting, isValidMpdServer } from '../../stores/config.js'
  import { favourites } from '../../stores/content.js'
  import { theme } from '../../stores/theme.js'
  import { focusTrap } from '../../actions/focusTrap.js'

  // Server only accepts these characters in a client_id (readData/writeData regex).
  const VALID = /^[A-Za-z0-9_.-]+$/
  const KNOWN_KEY = 'known_clients'

  let open = $state(false)
  let draft = $state('')
  let known = $state(readKnown())
  let mpdDraft = $state('')
  let mpdError = $derived(mpdDraft && !isValidMpdServer(mpdDraft) ? 'Use host:port, e.g. localhost:6600.' : '')

  let error = $derived(draft && !VALID.test(draft) ? 'Use letters, digits, "_", "-" or "." only.' : '')

  function readKnown() {
    try {
      const list = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]')
      return Array.isArray(list) ? list.filter((u) => VALID.test(u)) : []
    } catch {
      return []
    }
  }

  function remember(id) {
    const next = [id, ...known.filter((u) => u !== id)]
    known = next
    localStorage.setItem(KNOWN_KEY, JSON.stringify(next))
  }

  function show() {
    draft = ''
    mpdDraft = $config.mpd_server
    open = true
    remember($config.client_id)
  }

  function choose(id) {
    if (!VALID.test(id)) return
    if (id !== $config.client_id) {
      favourites.set(new Set())
      setSetting('client_id', id) // App re-mounts the views when client_id changes
    }
    remember(id)
    open = false
  }

  function onKey(e) {
    if (open && e.key === 'Escape') open = false
  }
</script>

<svelte:window onkeydown={onKey} />

<button
  type="button"
  class="flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm text-ink-muted hover:bg-surface-800 hover:text-ink"
  aria-label="Switch user, current: {$config.client_id}"
  onclick={show}
>
  <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
  </svg>
  <span class="truncate">{$config.client_id}</span>
</button>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
  >
    <div class="w-full max-w-sm rounded-2xl border border-surface-600 bg-surface-800 p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="us-title" use:focusTrap>
      <h2 id="us-title" class="mb-1 text-lg font-semibold text-ink">Who is listening?</h2>
      <p class="mb-4 text-xs text-ink-faint">
        Each user has their own random picks, favourites and history (including radio and Bandcamp).
      </p>

      <ul class="mb-4 flex flex-col gap-1">
        {#each known as id (id)}
          <li>
            <button
              type="button"
              class="flex min-h-touch w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-surface-700
                {id === $config.client_id ? 'text-accent-400' : 'text-ink'}"
              aria-current={id === $config.client_id ? 'true' : undefined}
              onclick={() => choose(id)}
            >
              <span class="truncate">{id}</span>
              {#if id === $config.client_id}<span aria-hidden="true">✓</span>{/if}
            </button>
          </li>
        {/each}
      </ul>

      <form
        class="flex gap-2"
        onsubmit={(e) => {
          e.preventDefault()
          if (draft && !error) choose(draft.trim())
        }}
      >
        <input
          type="text"
          bind:value={draft}
          placeholder="new user name"
          autocapitalize="off"
          autocomplete="off"
          class="h-touch min-w-0 flex-1 rounded-lg border border-surface-600 bg-surface-900 px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft || !!error}
          class="h-touch rounded-lg bg-accent-500 px-4 font-semibold text-surface-950 hover:bg-accent-400 disabled:opacity-50"
        >
          Use
        </button>
      </form>
      {#if error}<p class="mt-2 text-xs text-danger" role="alert">{error}</p>{/if}

      <form
        class="mt-4 mb-4"
        onsubmit={(e) => {
          e.preventDefault()
          const v = mpdDraft.trim()
          if (v && !mpdError && v !== $config.mpd_server) {
            favourites.set(new Set())
            setSetting('mpd_server', v) // App re-mounts the views when mpd_server changes
          }
        }}
      >
        <label for="us-mpd" class="mb-1 block text-xs text-ink-faint">MPD server (host:port, this device only)</label>
        <div class="flex gap-2">
          <input
            id="us-mpd"
            type="text"
            bind:value={mpdDraft}
            placeholder="localhost:6600"
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            class="h-touch min-w-0 flex-1 rounded-lg border border-surface-600 bg-surface-900 px-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!mpdDraft.trim() || !!mpdError || mpdDraft.trim() === $config.mpd_server}
            class="h-touch rounded-lg bg-accent-500 px-4 font-semibold text-surface-950 hover:bg-accent-400 disabled:opacity-50"
          >
            Set
          </button>
        </div>
        {#if mpdError}<p class="mt-2 text-xs text-danger" role="alert">{mpdError}</p>{/if}
      </form>

      <fieldset class="mb-4">
        <legend class="mb-1 text-xs text-ink-faint">Theme (this device only)</legend>
        <div class="flex gap-1 rounded-lg bg-surface-900 p-1">
          {#each [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [value, label] (value)}
            <button
              type="button"
              aria-pressed={$theme === value}
              class="min-h-touch flex-1 rounded-md text-sm font-medium {$theme === value ? 'bg-accent-500 text-surface-950' : 'text-ink-muted hover:text-ink'}"
              onclick={() => theme.set(value)}
            >
              {label}
            </button>
          {/each}
        </div>
      </fieldset>

      <button
        type="button"
        class="mt-4 h-touch w-full rounded-lg bg-surface-600 font-medium text-ink hover:bg-surface-700"
        onclick={() => (open = false)}
      >
        Close
      </button>
    </div>
  </div>
{/if}
