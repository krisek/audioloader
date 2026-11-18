<script>
  import { views, currentView, setView } from '../../stores/nav.js'
  import UserSwitcher from './UserSwitcher.svelte'
</script>

<nav
  aria-label="Main"
  class="hidden w-56 shrink-0 flex-col gap-1 border-r border-surface-700 bg-surface-900 p-3 md:flex"
>
  <h1 class="px-3 pb-4 pt-2 text-lg font-semibold text-accent-400">audioloader</h1>

  {#each views as view (view.id)}
    {@const active = $currentView === view.id}
    <button
      type="button"
      onclick={() => setView(view.id)}
      aria-current={active ? 'page' : undefined}
      class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors
        {active
        ? 'bg-surface-700 text-accent-400'
        : 'text-ink-muted hover:bg-surface-800 hover:text-ink'}"
    >
      <svg
        class="h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={view.icon} />
      </svg>
      {view.label}
    </button>
  {/each}

  <div class="mt-auto border-t border-surface-700 pt-3"><UserSwitcher /></div>
</nav>
