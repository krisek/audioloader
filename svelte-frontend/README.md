# audioloader – Svelte frontend

Svelte 5 + Vite + Tailwind 3 single-page web UI for **audioloader**, the thin Go
proxy in front of an [MPD](https://www.musicpd.org) server (see `../README.md`).
It replaces the legacy Angular client in `../angular`. The UI contains **no MPD
logic**: it only talks to the audioloader Go backend over plain HTTP/JSON.

- Plain JavaScript (no TypeScript), `jsconfig.json` has `checkJs` enabled.
- No router, no SvelteKit, no UI framework; navigation is a Svelte store.
- All runtime state lives in Svelte stores (`src/lib/stores`).
- Backend contract: **`../MPD_API_MAPPING.md`** (endpoint list, payload shapes,
  known quirks). Read it before changing any fetch code. Planning history is in
  `../AI_PLANNING.md`.

## Quick start

```bash
npm ci
npm run dev        # Vite dev server on http://localhost:5173, base '/'
npm run build      # production bundle into ./dist (base '/static/')
npm run preview
./build.sh [dir]   # build + rsync into ../static (default) for the Go server
```

For `npm run dev` you need a running audioloader backend. `public/app-config.json`
points at `http://localhost:3400` (see "Configuration"). The backend must allow
cross-origin requests from the dev server, or use a Vite proxy / same-origin setup.
(Verify CORS handling in `../server.go` if dev requests fail.)

## Deployment model

- The Go server serves the built UI from its `static/` folder at **`/static/`**,
  hence `base: '/static/'` in production builds (override: `BASE_URL=/x/ npm run build`).
- `build.sh` runs `npm run build` then `rsync --delete dist/ → ../static/`, but keeps:
  - `app-config.json` – per-installation; created once with `{"servicesBasePath": ""}`
    (same-origin API) if missing;
  - `assets/` – `server.go` uses `assets/vinyl.webp` as cover fallback. That is why
    Vite's `build.assetsDir` is `app`, not `assets`.
- `dist/` and `node_modules/` are git-ignored. Note `../static-2026*` are dated snapshots, ignore them.

## Configuration

Two layers, both in `src/lib/stores/config.js`:

1. **`app-config.json`** (fetched at boot from `BASE_URL`, `no-store`):
   `servicesBasePath` – backend base URL, `""` = same origin. App boot retries
   with 1,2,4,8 s backoff until it loads; views mount only once `config.loaded`.
2. **localStorage** runtime settings: `mpd_port` (default `6600`), `client_id`
   (default `guest`; the "user" owning favourites/history/random set), `list_from`,
   `last_directory`, `stream`, `stream_updated`, `log`, plus UI prefs
   (theme, grid/list view mode, known users list).

`apiUrl(endpoint, params, {withClient, withPort})` builds every backend URL
(always adds `mpd_port`; `client_id` when `withClient`; all values URL-encoded).
**Always use it; never hand-build URLs.**

## Source layout

```
src/
  main.js                 mounts App, imports app.css + theme store
  App.svelte              responsive shell, boot (loadConfig -> startPolling), view switch
  app.css                 Tailwind layers + CSS variables for themes
  lib/
    stores/
      config.js           app-config + localStorage settings, apiUrl()
      mpd.js              playback state: snapshot (/currentsong) + long poll
                          (/poll_currentsong), 1 s local elapsed ticker, backoff,
                          transport commands, output + snapcast toggles
      content.js          folders/search/favourites/history/random/radio/bandcamp/queue API calls
      nav.js              `views` list + `currentView` store (default: history)
      ui.js, theme.js     grid/list preference; system/light/dark theme (data-theme on <html>)
    views/                one component per area: Folders, Random, Favorites, History,
                          Queue, Radio, Bandcamp
    components/layout/    Sidebar (desktop), BottomNav (mobile), PlayerBar, UserSwitcher,
                          SnapcastMenu, ConnectionBanner
    components/ui/        MediaItem/MediaCollection (albums), StreamItem/StreamCollection
                          (radio/bandcamp), PlayVerification (confirm popup),
                          FavouriteButton, AddToQueueButton, ViewToggle, EmptyState, LoadingSkeleton
    actions/focusTrap.js  a11y action for modals
public/                   favicon, vinyl icons, dev app-config.json
```

## Key behaviours / gotchas

- **Playback state** is a *long poll* (server returns on the next MPD idle event or after 60 s);
  `POLL_MIN_DELTA` is 1 s between poll starts (anti hot-loop only), watchdog
  re-poll after 60 s, refresh on window focus if older than 30 s. Errors show the
  `ConnectionBanner` and trigger backoff + quick snapshot probes.
  MPD returns numbers as strings; `mpd.js::normalise` converts them.
- **Play button semantics:** the player bar sends `currentsong.next_state` (`play`/`pause`) as the command.
- **Play album** (`/addplay`) *clears the queue and plays* (consume mode), after a confirm popup.
  It also records history. Queue view can add single files, play/remove/clear entries.
- **Multi-user** is just `client_id`; `{#key $config.client_id}` in `App.svelte` remounts views on switch.
- Playback output devices: MPD outputs, Snapcast clients (mute toggles) and
  UPnP/Kodi renderers (`/upnp`, `/kodi`) are all exposed through the playback payload.
- Bandcamp view needs `bandcamp_enabled` on the server and `yt-dlp` there.
- Styling: Tailwind with semantic colour tokens (`surface-*`, `ink`, `accent-*`, `danger`, `warn`)
  backed by CSS variables so themes work. Use these, not raw colours. Mobile first;
  `md:` switches from BottomNav to Sidebar.

## Conventions for contributors (human or AI)

- Svelte 5 (`mount`, runes allowed) with classic `svelte/store` stores for shared state.
- Keep API knowledge in the stores, views stay presentational.
- Update `../MPD_API_MAPPING.md` if you change/consume an endpoint differently.
- No test suite or linter at present (`npm run build` is the only check).
