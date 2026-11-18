<script>
  import { mpd, toggleSnapcastClient } from '../../stores/mpd.js'

  let open = $state(false)
  let root = $state()
  let busy = $state('')
  let error = $state('')

  let clients = $derived($mpd.snapcast_clients || [])
  let mutedCount = $derived(clients.filter((c) => c.muted).length)

  async function toggle(client) {
    busy = client.id
    error = ''
    try {
      await toggleSnapcastClient(client.id, !client.muted) // target state = inverse of current
    } catch (e) {
      error = `Could not update ${client.name}: ${e.message || e}`
    } finally {
      busy = ''
    }
  }

  function onKey(e) {
    if (open && e.key === 'Escape') open = false
  }

  function onDocClick(e) {
    if (open && root && !root.contains(e.target)) open = false
  }
</script>

<svelte:window onkeydown={onKey} onclick={onDocClick} />

{#if $mpd.active && clients.length}
  <div class="shrink-0 sm:relative" bind:this={root}>
    <button
      type="button"
      class="relative flex h-touch min-h-touch w-touch min-w-touch items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-700 hover:text-ink"
      aria-label="Snapcast clients"
      aria-haspopup="true"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 12a9 9 0 0 1 8 8M2 16a5 5 0 0 1 4 4M2 20h.01" />
      </svg>
      {#if mutedCount}
        <span class="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" aria-hidden="true"></span>
      {/if}
    </button>

    {#if open}
      <div class="absolute bottom-full left-2 right-2 z-40 mb-1 max-h-[60vh] overflow-y-auto rounded-xl sm:left-auto sm:right-0 sm:mb-2 sm:w-72 sm:max-w-[80vw] border border-surface-600 bg-surface-800 p-1 text-ink shadow-xl" style="color: rgb(var(--ink))">
        <p class="px-3 pb-1 pt-2 text-xs text-ink-faint">Snapcast clients</p>
        <ul>
          {#each clients as client (client.id)}
            <li>
              <button
                type="button"
                disabled={busy === client.id}
                class="flex min-h-touch w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm hover:bg-surface-700 disabled:opacity-50"
                style="color: rgb(var({client.muted ? '--ink-muted' : '--ink'}))"
                class:line-through={client.muted}
                aria-label="{client.muted ? 'Unmute' : 'Mute'} {client.name}"
                onclick={() => toggle(client)}
              >
                <span class="truncate">{client.name}{client.connected === false ? ' (offline)' : ''}</span>
                <span class="shrink-0 text-xs text-accent-400 no-underline">{client.muted ? 'unmute' : 'mute'}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if error}<p class="px-3 pb-2 text-xs text-danger" role="alert">{error}</p>{/if}
      </div>
    {/if}
  </div>
{/if}
