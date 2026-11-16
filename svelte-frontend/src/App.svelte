<script>
  import { onMount } from 'svelte'
  import { config, loadConfig } from './lib/stores/config.js'
  import { startPolling, stopPolling } from './lib/stores/mpd.js'
  import { currentView } from './lib/stores/nav.js'
  import Sidebar from './lib/components/layout/Sidebar.svelte'
  import BottomNav from './lib/components/layout/BottomNav.svelte'
  import UserSwitcher from './lib/components/layout/UserSwitcher.svelte'
  import ConnectionBanner from './lib/components/layout/ConnectionBanner.svelte'
  import PlayerBar from './lib/components/layout/PlayerBar.svelte'
  import FoldersView from './lib/views/FoldersView.svelte'
  import RandomView from './lib/views/RandomView.svelte'
  import FavoritesView from './lib/views/FavoritesView.svelte'
  import HistoryView from './lib/views/HistoryView.svelte'
  import QueueView from './lib/views/QueueView.svelte'
  import RadioView from './lib/views/RadioView.svelte'
  import BandcampView from './lib/views/BandcampView.svelte'

  onMount(() => {
    let stopped = false
    let timer
    // Views are only mounted once the config (server URL) is known; retry with backoff 1,2,4,8,8... s.
    async function boot(attempt = 0) {
      const c = await loadConfig()
      if (stopped) return
      if (c.loaded) {
        startPolling()
      } else {
        timer = setTimeout(() => boot(attempt + 1), Math.min(1000 * 2 ** attempt, 8000))
      }
    }
    boot()
    return () => {
      stopped = true
      clearTimeout(timer)
      stopPolling()
    }
  })
</script>

<!--
  Responsive shell
  - mobile : column  [ content | PlayerBar | BottomNav ]
  - desktop: row     [ Sidebar | column [ content | PlayerBar ] ]
  Only <main> scrolls; PlayerBar and navs are shrink-0 and always visible.
-->
<div class="flex h-full flex-col bg-surface-950 text-ink md:flex-row">
  <Sidebar />

  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- min-h-0 lets the flex child shrink so overflow-y-auto actually scrolls -->
    <!-- Mobile-only top bar (the sidebar holds the switcher on desktop) -->
    <header class="flex shrink-0 items-center justify-between border-b border-surface-700 bg-surface-900 px-2 md:hidden">
      <span class="px-2 text-sm font-semibold text-accent-400">audioloader</span>
      <UserSwitcher />
    </header>

    <ConnectionBanner />

    <main class="min-h-0 flex-1 overflow-y-auto">
      <!-- Re-mount the active view when the user changes so it reloads that user's data -->
      {#key `${$config.client_id}|${$config.mpd_server}`}
      {#if $config.loaded}
      {#if $currentView === 'folders'}
        <FoldersView />
      {:else if $currentView === 'random'}
        <RandomView />
      {:else if $currentView === 'favorites'}
        <FavoritesView />
      {:else if $currentView === 'history'}
        <HistoryView />
      {:else if $currentView === 'queue'}
        <QueueView />
      {:else if $currentView === 'radio'}
        <RadioView />
      {:else if $currentView === 'bandcamp'}
        <BandcampView />
      {/if}
      {/if}
      {/key}
    </main>

    <PlayerBar />
  </div>

  <BottomNav />
</div>
