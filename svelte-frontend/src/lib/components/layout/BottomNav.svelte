<script>
  import { views, currentView, setView } from '../../stores/nav.js'
</script>

<nav
  aria-label="Main"
  class="flex shrink-0 border-t border-surface-700 bg-surface-900 md:hidden"
>
  {#each views as view (view.id)}
    {@const active = $currentView === view.id}
    <button
      type="button"
      onclick={() => setView(view.id)}
      aria-current={active ? 'page' : undefined}
      class="flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium transition-colors
        {active ? 'text-accent-400' : 'text-ink-muted hover:text-ink'}"
    >
      <svg
        class="h-5 w-5"
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
</nav>
