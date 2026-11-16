# Audio Loader: Svelte Migration & UI Redesign Directives

You are acting as a Senior Svelte Developer and Frontend Architect. Your task is to migrate the existing Angular-based `audioloader` frontend (currently located in `./angular/audioloader/`) to a lightweight Svelte + Vite stack, while simultaneously redesigning the UI to be a highly responsive, mobile-first interface.

## Project Identity & Product Vision
- **Core Identity:** Audioloader is an album-and-folder-oriented MPD client. It is NOT a streaming service clone.
- **Design Reference:** Use Spotify as a reference for UI polish, mobile ergonomics, touch targets, and responsive behavior, but do NOT copy its information architecture.
- **Workflow Preservation:** Maintain the folder-first music selection, full-album listening experience, and the existing backend API integration.

## Architectural Constraints (Strict)
1. **The Stack:** Use Svelte (with Vite) and Tailwind CSS. Completely remove all Angular dependencies, RxJS, and heavy enterprise patterns.
2. **Pragmatic Structure:** Do NOT map legacy Angular components 1:1 to Svelte components. Angular forced an over-segmented architecture (e.g., separate `albumcell` or `popup` components). In Svelte, prefer flatter structures. Use inline `{#if}` blocks for modals/popups unless a separate component is strictly necessary for reusability.
3. **State Management:** Replace Angular services (`app-config-service`, `toast-service`) with native Svelte stores (`writable`, `readable`, `derived`). 
4. **Performance:** Prioritize lightweight DOM structures. Avoid elaborate animations or complex CSS that degrades performance on mobile devices.

## Core Features (Do Not Remove or Demote)
When refactoring layouts, these features are first-class citizens:
- **Dashboard:** The random album/folder roaster, recent history, and favorites are signature features.
- **Keep the core logic** Four music selection areas now (horizontal navigation, ie. tabs, or views): folder navigation, dash (random roaster, history, favourites), radio, bandcamp history. Maybe dash needs to be split in refactored setup in usability, so that we have 6 separate verticaly selectable areas. History can be this way even doubled.
- **Library & Search:** Maintain the folder-first model. Ensure grids adapt to readable lists on narrow mobile screens.
- **Play Verification:** Preserve the existing pop-up verification behavior (previously `popup` and `popup_load`) before replacing the MPD queue, but implement it natively and simply in Svelte.
- **Radio Browser & Bandcamp:** Treat these as dedicated, first-class tabs/views.
- **Playback Controls:** Implement a persistent, compact now-playing bar with large, accessible touch controls for mobile.
- **List/Grid View Toggle:** Implement a universal UI toggle for content displays (Folders, History, Favorites) to switch between a List view and a Grid view. 
- **Consistent Grouping:** The existing grouping logic MUST be applied to both the List and the Grid views (Note: The legacy Angular application lacked grouping logic in the grid view; the Svelte refactor must fix this).

## Workflow & Refactoring Rules
1. **Phase 0 First:** You must thoroughly inspect the legacy Angular codebase in `./angular/audioloader/` to understand the MPD API data flow and legacy logic before scaffolding the new project.
2. **Incremental Migration:** Do not rewrite the entire app in one go. Follow the `AI_PLANNING.md` checklist step-by-step.
3. **No Backend Changes:** Keep modifications strictly to the frontend presentation layer.

## Svelte 5 Development Rules (Strict)
To prevent legacy syntax and minimize rewrite iterations, strictly adhere to Svelte 5 Runes and patterns:
- **Reactivity:** Use `$state()`, `$derived()`, and `$effect()` exclusively. Do NOT use legacy reactive declarations (`$:`).
- **Props:** Use `let { propName = defaultValue } = $props();` instead of `export let`.
- **Event Handlers:** Pass functions as callback props (e.g., `let { onclick } = $props();`) instead of using `createEventDispatcher`.
- **Snippets:** Use `{#snippet name()}` for reusable template blocks inside components instead of legacy `<slot>`.
- **Bindings:** Use `$bindable()` for two-way binding props.
- **Markup:** Use semantic HTML and Tailwind CSS. Avoid wrapper `div`s when styling the native element (like `<button>`) will suffice.
