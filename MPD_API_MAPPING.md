# MPD API & Legacy Logic Mapping (Phase 0)

> **Removed:** `/kodi`, `/upnp`, `/active_players`, the `players` field and the `discover*.py` scripts no longer exist. Sections below about renderers, `openStream` and the load popups describe the old Angular client only.


Reference extracted from the legacy Angular client (`angular/audioloader/src/app/`) and the Go backend (`server.go`).
Purpose: a clean data/logic contract for the new Svelte stores. No Svelte code here.

Primary sources:
- `app.component.ts` / `app.component.html` (almost all logic lives here — a single "god component")
- `popup/`, `popup_load/`, `albumcell/`, `settings/` components
- `app-config-service.service.ts`, `assets/app-config.json`
- `server.go` (route table at lines ~398–435, handlers below it)

---

## 1. Backend API endpoints

### 1.1 Conventions

- **All calls are HTTP `GET`** to `${servicesBasePath}/<endpoint>?<query>`. No POST/PUT/DELETE is used anywhere.
- Almost every call carries `mpd_port=<settings.mpd_port>` (backend picks the MPD connection by port; host comes from `AL_MPD_HOST`).
- Per-client data calls additionally carry `client_id=<settings.client_id>` (default `guest`). Backend stores data in `${AL_CLIENT_DB}/<client_id>.<type>.json`; `client_id` must match `^[A-Za-z0-9_\-\.]+$`.
- Responses are JSON; list-like responses are wrapped as `{ "tree": [...] }` (sometimes with an empty `"info": {}`).
- Errors: the Angular client mostly ignores them (no error handlers), except polling and `openStream`.

### 1.2 Endpoints called by the Angular frontend

| Endpoint | Query params | Called from (Angular) | Response | Notes |
|---|---|---|---|---|
| `/poll_currentsong` | `mpd_port` | `pollCurrentsong()` | [PlaybackState](#23-playback-state-currentsong--poll_currentsong) | Long-poll (server waits on MPD idle). Duplicate poll from same client → server answers immediately like `/currentsong`. |
| `/currentsong` | `mpd_port` | `updateCurrentSong()` | PlaybackState | Immediate snapshot. Called after commands, addplay, output toggles. |
| `/ls` | `mpd_port`, `directory` (URL-encoded, root = `.`) | `showDir(dir)` | [DirTree](#22-album--directory-data) | Directory listing incl. sub-dir counts. |
| `/search` | `mpd_port`, `pattern` | `performSearch()` (dash/browser view, not bandcamp URL) | DirTree | Min 3 chars, 300ms debounce, `distinctUntilChanged`, `switchMap`. |
| `/cover` | `mpd_port`, `directory` (encoded) | `<img src>` in albumcell, folder view, popup | image bytes | Not an XHR. Popup omits `mpd_port` (legacy bug). Server also supports `response_type`. |
| `/favourites` | `mpd_port`, `client_id` | `updateSpec('favourites')` | ClientDirList | |
| `/history` | `mpd_port`, `client_id` | `updateSpec('history')` | ClientDirList | |
| `/randomset` | `mpd_port`, `client_id` | `updateSpec('randomset')` | ClientDirList | Server auto-generates a set if empty. |
| `/generate_randomset` | `mpd_port`, `client_id` | `newSet()` | `{"result":"ok"\|"nok"}` | 12 random albums, distinct artists. Client then re-fetches `/randomset`. |
| `/add_favourite` | `mpd_port`, `directory`, `client_id` | `toggleFavourite()` | (ignored) | Same handler as remove. |
| `/remove_favourite` | `mpd_port`, `directory`, `client_id` | `toggleFavourite()` | (ignored) | |
| `/addplay` | `mpd_port`, `client_id`, **either** `directory` **or** `url`,`name`,`stationuuid`,`favicon` | `addDir()` (after popup confirm) | (ignored) | Clears queue & plays (consume mode). Server also records history / radio_history / bandcamp_history. ⚠ `url`/`name`/`favicon` are **not URL-encoded** by the client. |
| `/play` `/pause` `/playpause` `/next` `/prev` `/stop` | `mpd_port` | `sendCommand(cmd)` | (ignored) | Navbar uses `currentsong.next_state` (`play`/`pause`) as the play/pause command. |
| `/remove_history` | `client_id` + `directory` **or** `url` (encoded) [+ `stationuuid` for radio] | `removeHistory()` | (ignored) | No `mpd_port`. `stationuuid` present → radio history, url w/o uuid → bandcamp history, directory → folder history. |
| `/radio_history` | `mpd_port`, `client_id` | `updateRadioHistory()` / `showRadio()` | [RadioHistory](#24-radio--bandcamp) | Raw ClientData file content. |
| `/bandcamp_history` | `mpd_port`, `client_id` | `updateBandcampHistory()` | [BandcampHistory](#24-radio--bandcamp) | Only if `bandcamp_enabled`. |
| `/search_radio` | `mpd_port`, `pattern` | `performSearch()` when radio view | `{tree: RadioStation[]}` | Proxies radio-browser.info. |
| `/search_bandcamp` | `mpd_port`, `pattern` (bandcamp/youtube URL) | `performSearch()` when bandcamp view or pattern matches `bandcamp.com/` | `{tree: [{title, artist, url, art}]}` | Client uses only `tree[0]` and opens the play popup with it. Requires `yt-dlp` on server. |
| `/queue` | `mpd_port` | `fetchQueue()` (Queue view) | `{queue: [{id,pos,file,title,artist,album,duration}], current_id}` | Play queue in order; `current_id` is the playing entry. |
| `/queue_play` `/queue_remove` | `mpd_port`, `id` (queue entry id) | `queueAction()` | `{message}` | Play / delete one entry. |
| `/queue_clear` | `mpd_port` | `queueAction('queue_clear')` | `{message}` | Removes every entry except the playing one (empties the queue when stopped). |
| `/volume` | `mpd_port`, `value=0..100` | `setVolume(value)` | `{message, volume}` | Sets the MPD mixer volume (`setvol`). 400 when `value` is not an integer 0-100. The current volume is `volume` in `/currentsong` / `/poll_currentsong`; it is absent (or `-1`) when MPD has no mixer, so UIs hide the control. `/poll_currentsong` also wakes on `mixer` and `output` events. |
| `/toggleoutput` | `mpd_port`, `output=<outputid>` | `toggleMpdOutput(output)` | (ignored) | Enables/disables an MPD output. |
| `/togglesnapcastclient` | `mpd_port`, `id`, `muted=true\|false` | `toggleSnapcastClient(client)` | (ignored) | `muted` is the **target** state (inverse of current). |

### 1.3 Endpoints served but NOT used by the Angular client

`/listfiles`, `/lsinfo`, `/status`, `/count`, `/snapcastclients`, `/debug/mpd_metrics`, `/static/`, `/` (catch-all serving the SPA).
Players and snapcast clients are instead embedded in the PlaybackState payload.

---

## 2. JSON payload shapes

TypeScript-style notation for documentation only. `?` means the field is optional or may be missing.
Most values that come from MPD are **strings**, even numeric ones, because the MPD protocol is text.

### 2.1 Configuration

#### `assets/app-config.json` (bootstrap config)

```jsonc
{
  "servicesBasePath": "http://localhost:3400"   // only key; base URL of the Go backend
}
```

`AppConfigService.loadAppConfig()` loads this once as an app initializer (`GET assets/app-config.json`), before the app starts. `AppComponent` reads `environment.config.servicesBasePath`.

#### Runtime settings (`localStorage`, edited in the Settings modal)

| key | default | used for |
|---|---|---|
| `mpd_port` | `'6600'` | `mpd_port` query param on every call |
| `client_id` | `'guest'` (also used when empty) | `client_id` query param |
| `list_from` | `60` (read with `parseInt`) | threshold for switching folders between grid and list (see §3.1) |
| `stream` | `''`, then filled from `currentsong.default_stream` | `stream` param for `/kodi` and `/upnp` |
| `stream_updated` | unset | set to `true` when the user edits `stream`; meant to stop the automatic fill |
| `log` | unset | `'debug'` turns on verbose console logs |
| `last_directory` | `'.'` | written on every `updateDir()` and restored on init |

The Settings modal emits the name of the changed key, and the parent then runs `settings[key] = localStorage[key]`.

How `stream` gets filled automatically (inside the poll): the client sets `localStorage.stream = default_stream` when all of these are true:
- `localStorage.stream` is empty or undefined
- the payload contains `default_stream`
- either `stream_updated` is missing from the payload, or `localStorage.stream_updated == false`

The check reads `currentsong.stream_updated`, which the server never sends. In practice the stream is filled whenever it is empty.

### 2.2 Album / directory data

#### `DirTree`: response of `/ls` and `/search`

```ts
{ tree: Array<DirEntry | FileEntry> }

DirEntry = {
  directory: string,                 // full MPD path, e.g. "Artist/Album"
  "last-modified"?: string,
  count: {
    playhours: string,               // "H:MM:SS" display string
    playtime: string,                // total seconds, as string
    songs: string                    // number of songs, as string
  }
}

FileEntry = {
  file: string,                      // full MPD path to the track
  title?: string,                    // client falls back to baseName(file)
  track?: string,
  duration?: string,                 // seconds (float string)
  artist?: string, album?: string, genre?: string,
  date?: string, codec?: string, format?: string, time?: string,
  "last-modified"?: string
}
```

An entry with `directory` is a folder. An entry with `file` is a track.

#### `ClientDirList`: response of `/favourites`, `/history`, `/randomset`

```ts
{
  tree: Array<{
    directory: string,
    count?: { playhours: string /* "M:S" or "H:M:S", unpadded */, playtime: string, songs: string },
    stream?: string                  // only for http:// entries, which have no count
  }>,
  info: {}
}
```

- The server returns each list in **stored order**. For history that is oldest first: `/addplay` moves the replayed entry to the end and keeps the last 10. A `reverse()` helper exists in `server.go` but is never called.
- Directories that no longer exist in MPD are skipped without any error.
- The client keeps only entries that have `directory`.

#### Client data file on the server (`<client_id>.<type>.json`, `ClientData` struct)

```ts
{
  history?: string[],               // directory paths, oldest first, max 10
  randomset?: string[],             // 12 directory paths
  favourites?: string[],            // directory paths
  radio_history?: string[],         // stationuuid list, oldest first, max 12
  bandcamp_history?: string[],      // album URLs, oldest first, trimmed to bandcampHistorySize
  stations?: Record<stationuuid, { url, stationuuid, name, favicon }>,
  links?: Record<url, { url, title, favicon, artist, date }>
}
```

#### Client view model: "AlbumItem" (built by the client and passed to `app-albumcell`)

```ts
{
  name: string,        // full path (identity key)
  encoded: string,     // encodeURIComponent(name), used for /cover
  title: string,       // baseName(name)
  short: string,       // truncate(title, 35, '…')
  playhours: string,   // from count.playhours
  playtime: string,    // from count.playtime (seconds), used for the 7200 s rule
  favourite: boolean
}
```

`app-albumcell` emits `{ dir: album.name, playtime: album.playtime, action, area }`, where `action` is one of `'coverPress'`, `'toggleFavourite'`, `'openModal'` or `'showDir'`.

### 2.3 Playback state (`/currentsong`, `/poll_currentsong`)

One flat object: MPD `currentsong` merged with MPD `status`, plus fields the server computes:

```ts
{
  // from MPD currentsong (raw tag names, all strings)
  file?: string, Title?: string, Artist?: string, Album?: string, Track?: string,
  Name?: string /* radio stream name */, Date?: string, Genre?: string, Id?: string, Pos?: string,

  // from MPD status (all strings)
  state: 'play' | 'pause' | 'stop',
  elapsed?: string, duration?: string, volume?: string,
  consume: '0' | '1', random: string, repeat: string, single: string,
  playlistlength: string, song?: string, songid?: string, bitrate?: string, audio?: string,

  // computed by processCurrentSong() in server.go
  play: boolean, pause: boolean, stop: boolean,
  title: string,                 // "not playing" when inactive; file path when there is no Title
  display_title: string,         // "Track - Title", or file path, or "not playing"
  display_title_top: string,     // "Artist - Album", or Name (radio)
  active: boolean,               // true when state is play or pause
  next_state?: 'pause' | 'play', // missing when stopped
  next_title?: string,           // "playing ➙ pause" | "paused ➙ play"
  next_icon?: string,            // Material icon name: pause_circle_outline | play_circle_outline

  // extras added by the handler
  outputs: Array<{ outputid: string, outputname: string, outputenabled: '0'|'1', plugin?: string }>,
  // players[] (renderers) was removed with /kodi, /upnp, /active_players and discover*.py
  bandcamp_enabled: boolean,     // AL_BANDCAMP_ENABLED
  default_stream: string,        // AL_DEFAULT_STREAM
  snapcast_clients?: Array<{ id: string, name: string, connected: boolean, muted: boolean }>  // only when AL_SNAPCAST_HOST is set
}

Player = {                       // free-form JSON from redis; the client uses these fields:
  name: string,                  // display label
  location: string,              // sent as `server=` to /kodi or /upnp; identity key in the popups
  model_name: string,            // 'Kodi' → /kodi, anything else → /upnp
  load?: boolean | null          // ⚠ UI state the popups write directly into this shared object
}
```

The client adds `title_short = display_title`, and increments `elapsed` locally on every tick while `state == 'play'`.

How the navbar uses it:
- Text: `display_title_top` and `display_title`.
- Progress bar `elapsed / duration`, shown when `active`.
- Play/pause button: `sendCommand(next_state)` with the `next_icon` icon, shown when `next_state` exists.
- Stop and next: shown when `active`.
- Prev: shown when `!consume`. ⚠ `consume` is the string `"0"` or `"1"`, and `!"0"` is `false` in JavaScript, so prev never appears.
- Outputs dropdown: shown when `outputs.length > 1`.
- Snapcast dropdown: shown when `active && snapcast_clients`.
- "Load to renderers" button (opens `popup_load`): shown when `active && players.length > 0`.

#### Polling algorithm (to reproduce in the playback store)

1. On init, call `updateCurrentSong()`, then `pollCurrentsong()`.
2. `pollCurrentsong()`:
   - If a poll is already running (`pollWaitState`) and the last poll started less than 60 s ago, return.
   - Keep at least `pollMinDelta = 20000` ms between poll starts (wait out the rest if needed).
   - Call `GET /poll_currentsong`. On success, store the state and **start the next poll right away**. On error, wait 5 s, then poll again.
3. `sendCommand()` resets `lastPolledStarted` so the next poll isn't delayed, then calls `/currentsong`.
4. A tick timer runs (`interval(1000)`). Each tick increments `elapsed` while playing, and re-polls if the last poll is more than 60 s old. On window focus it re-polls if the last poll is more than 30 s old.
   - ⚠ Legacy bug: the focus/blur handlers assign a new `interval(1000)` or `interval(5000)` to `pollCounter`, but the existing subscription never changes, so the 5 s rate on blur has no effect.

The server rejects a second poll from the same client while one is running, and answers it immediately with the `/currentsong` snapshot.

### 2.4 Radio & Bandcamp

```ts
RadioStation  = { name: string, favicon: string, bitrate: number, stationuuid: string, url: string }
// /search_radio → { tree: RadioStation[] }

RadioHistory  = { radio_history: string[] /* uuids */, stations: Record<uuid, {url, stationuuid, name, favicon}> }
// or { tree: [], info: {} } when no file exists yet

BandcampHistory = { bandcamp_history: string[] /* urls */, links: Record<url, {url, title, favicon, artist, date}> }
// or { tree: [], info: {} } when no file exists yet

BandcampSearch  = { tree: Array<{ title, artist, url, art }> }   // the client uses only tree[0]
```

The radio and Bandcamp history views loop over the id array and look each entry up in `stations` or `links`. These are stored oldest first (radio keeps the last 12), and nothing reverses them. Folder history works the same way.

---

## 3. Legacy grouping logic (Folders, History, Favorites)

Helper functions (in `app.component.ts`), to port exactly:

```ts
baseName(path)  = path.replace(/\\/g,'/').replace(/.*\//, '')         // last path segment
dirName(path)   = path.replace(/\\/g,'/').replace(/\/[^\/]*$/, '')     // parent path ('A' stays 'A')
compareNC(a, b) = a.toUpperCase().localeCompare(b.toUpperCase())       // case-insensitive sort
truncate(str, length = 35, ending = '…')                               // '' for null/undefined
```

### 3.1 Folders: `displayTree(data)` (used for both `/ls` and `/search` results)

State built from `data.tree`:

| structure | contents |
|---|---|
| `tree_dir: Record<path, AlbumItem>` | one AlbumItem per `directory` entry, starting from `count` (so it carries `playhours`, `playtime`, `songs`), plus `name`, `encoded`, `title`, `short`, `favourite` |
| `list_dir: path[]` | all folder paths, deduplicated, sorted with `compareNC` **on the full path** |
| `list_dir_alpha: Record<initial, path[]>` | folders grouped by `initial = title.substring(0, 1)`. Each group is sorted with `compareNC` on the full path |
| `list_alpha: initial[]` | the distinct initials, sorted with `compareNC` |
| `tree_file: Record<filepath, FileEntry>` | tracks; `title` falls back to `baseName(file)` |
| `dirs: boolean` | true if there is at least one sub-folder |
| `dircount: number` | number of sub-folders |
| `showlist: boolean` | `dircount > settings.list_from` (default 60) |

`favourite` on each folder is `true` when the path is in `list_dir_dash.favourites` (the favorites list must be loaded first).

Rendering rules:

1. **`!showlist`** (≤ `list_from` folders): a flat **grid** of `app-albumcell` in `list_dir` order. **No grouping.**
2. **`showlist`** (> `list_from` folders): an alphabetical **list**. For each `initial` in `list_alpha`, a bold heading, then one row per path in `list_dir_alpha[initial]`: favourite toggle, play button (`openModal`), and a link `title (playhours)` that opens the folder (`showDir`).
3. **`!dirs`** (a leaf folder, i.e. an album): a large cover (click opens `openModal(dir)`) and a track list. Each track shows `track - title (duration)` when `track` exists, otherwise just `title`. Duration is `seconds*1000 | date:'H:mm:ss':'UTC'` with up to two leading `0:` removed (e.g. `0:04:12` → `4:12`).

Quirks to note (decide on each in the Svelte version):
- The grouping key is the **first character as written** (not uppercased), so `a…` and `A…` land in separate groups. Their order relative to each other depends on `localeCompare`. Digits and symbols each get their own group.
- Sorting uses the full path while grouping uses the title (the last segment). For `/ls` these give the same result, because every entry shares the parent path. For `/search`, paths come from many parents, so the order inside a group may not match the visible titles.
- The grid view never uses `list_dir_alpha`, so there are no section headers in grid mode. This is the omission that Phase 5 fixes. **Recommended unified model:** compute `groups = [{ initial, items: AlbumItem[] }]` once, then render it as either list or grid. The `list_from` threshold only picks the default view mode.

Breadcrumb (`updateDir(dir)`): walk `dirName` up from `dir` and push `{name: baseName(p), dir: p}` at each step until it stops changing. Add `{name: '.', dir: '.'}` unless `dir == '.'`, then reverse. Each segment opens `showDir(segment.dir)`. `updateDir` also sets the header's `favourite` flag and saves `localStorage.last_directory`.

Deep links: navigating sets the URL fragment `#<encodeURIComponent(dir)>`. On load, a fragment opens `showDir(decodeURIComponent(fragment))`. "Share" copies `${origin}/#${encoded}` to the clipboard.

### 3.2 Dash lists: `updateSpec(spec)` for `favourites`, `history`, `randomset`

```ts
list_dir_dash[spec] = data.tree
  .filter(e => 'directory' in e)
  .map(e => ({
    name: e.directory,
    encoded: encodeURIComponent(e.directory),
    title: baseName(e.directory),
    short: truncate(baseName(e.directory)),
    playhours: e.count.playhours,
    playtime: e.count.playtime,
    favourite: spec === 'favourites' || list_dir_dash.favourites.some(f => f.name === e.directory)
  }));
```

- The lists keep the **server order**, which is the stored order: oldest first for history. Neither the server nor the client reverses it, so the newest play shows last. The client doesn't sort or group them alphabetically. In Svelte, decide whether to show the newest first.
- `showDash()` starts all three requests at once, in the order `['favourites', 'history', 'randomset']`.
  - ⚠ This is a race: the `favourite` flags on history and randomset are only correct when the favourites response arrives first.
  - In Svelte, derive `favourite` from a favourites store instead.
- Layout:
  - Left column: Random as a grid, with a "new set" sync button that calls `/generate_randomset` and then `/randomset`.
  - Below it, a "Favourites" divider and the favourites grid.
  - Narrow right column: History as a grid.
- Only the server writes folder history, inside `/addplay`. Entries are removed with `/remove_history?directory=`.
  - There is no remove button for folder history in the UI.
  - Only radio and Bandcamp entries use `openHistoryRemoveModal`.

### 3.3 Favourite toggle: `toggleFavourite(path)`

1. Set `action` to `remove_favourite` if `path` is already a favourite, otherwise `add_favourite`, and call that endpoint.
2. When the response arrives, update local state: remove the item from `list_dir_dash.favourites`, or append a new AlbumItem without `playhours`/`playtime`.
3. Flip `tree_dir[path].favourite` if it exists. Also flip `favourite` on matching items in `history` and `randomset`.
4. ⚠ Legacy bug: the folder header star (`this.favourite`) only updates on the next `updateDir`.

### 3.4 Cover click rule (`coverPress` / `coverPressArea`)

- `playtime < 7200` (under 2 h, likely a single album): `openModal(dir)`, the play confirmation.
- Otherwise (likely an artist or collection folder): `showDir(dir)`, which opens the folder.

Every grid uses this rule.

### 3.5 Radio & Bandcamp views

**Radio:**
- Grid of `radio_history.radio_history`. Each uuid resolves to `stations[uuid]`, with the favicon as the cover.
- Below it, search results (`stations`, from `/search_radio`) as a list.
- Play opens `openRadioModal(name, stationuuid, url, favicon)`. Remove opens `openHistoryRemoveModal(...)`.

**Bandcamp:**
- Grid of `bandcamp_history.bandcamp_history`. Each URL resolves to `links[url]`.
- The label is `artist - date - title`, with each part shown only when present.
- Play calls `openRadioModal(title, artist, url, favicon)`. ⚠ This passes `artist` in the `stationuuid` argument.
- Searching for a URL calls `/search_bandcamp` and opens the popup with `tree[0]` (`title, artist, url, art`).

---

## 4. `popup` and `popup_load` verification flows

Both are `NgbModal` components. The parent opens them with `modalService.open(Component)`, sets the `@Input`s on `componentInstance`, and subscribes to `messageEvent`. Both modals close with `dismissAll` right after emitting.

### 4.1 `popup` (`PopupComponent`): confirmation for play or remove

**Inputs:** `name`, `action` (`'Play'` or `'Remove from history'`), `encoded`, `servicesBasePath`, `players` (= `currentsong.players`, **the same array object**), `stationuuid`, `url`, `favicon`.

**Triggers:**

| Trigger | Opener | Inputs set |
|---|---|---|
| albumcell play icon, folder header play, list-row play, album cover (leaf), cover click with `playtime < 7200` | `openModal(dir)` | `name = dir`, `action = 'Play'`, `url = stationuuid = favicon = ''` |
| radio station play or cover, Bandcamp play, Bandcamp URL search result | `openRadioModal(name, stationuuid, url, favicon)` | `action = 'Play'` |
| radio or Bandcamp "remove_selection" icon | `openHistoryRemoveModal(name, stationuuid, url, favicon)` | `action = 'Remove from history'` |

**What the modal shows:**
- Title: `"{action} {name}?"`.
- Image: when `url` is empty, the folder cover from `/cover?directory=<encoded>` (no `mpd_port`). When `favicon` is set, the favicon.
- When `action === 'Play'`, one `mat-slide-toggle` per player, labelled `player.name`.
- Buttons: **Yes** (has autofocus) and **Cancel**.

**State:**
- `ngOnInit`: set `players[i].load = false` for every player. This mutates the shared `currentsong.players`.
- `updateLoad(event, location)`: set `players[i].load = event.checked` on the player whose `location` matches.
- **Yes** calls `addDir(name)`. That builds `load = [indices i where players[i].load]` and emits:

```ts
{ dir: name, load: number[], url, stationuuid, favicon }
```

- **Cancel** closes the modal and emits nothing.

**What the parent does with the result:**
- After a Play: `addDir(entry)`
  1. Build the params: `url=<url>&name=<dir>&stationuuid=…&favicon=…` when `url` is set, otherwise `directory=<encoded dir>`.
  2. `GET /addplay?mpd_port&<params>&client_id`.
  3. On success, show the toast `loaded <truncate(url or baseName(dir), 10)>`.
  4. Refresh the current view: `showDash()`, `showRadio()` or `showBandcamp()`.
  5. Call `updateCurrentSong()`.
  6. Call `openStream(i)` for each index `i` in `entry.load`.
- After a Remove from history: `removeHistory(entry)`
  1. Build the params: `url=<enc url>&stationuuid=…` for radio, `url=<enc url>` for Bandcamp, or `directory=<enc dir>` for folders.
  2. `GET /remove_history?client_id&<params>`.
  3. Re-show the view: radio → `showRadio()`, Bandcamp → `showBandcamp()`, folder → toast and `showDash()`.
  - The renderer toggles are hidden here, but `load` is still emitted, as `[]`.

**`openStream(i)` / `stopStream(i)`:**
- Pick the target: `target = players[i].model_name == 'Kodi' ? 'kodi' : 'upnp'`.
- Call `GET /{target}?mpd_port&action=Player.Open|Player.Stop&server=<players[i].location>&stream=<localStorage.stream>`.
- Results:
  - Open succeeds: toast `loaded to <name>`.
  - Open fails: toast `error loading to kodi`.
  - Stop succeeds: toast `unloaded from <name>`. Stop has no error handler.
- Both set `loading.kodiload` / `loading.kodistop` flags, which are never shown in the UI.

### 4.2 `popup_load` (`PopupLoadComponent`): switch renderers on or off

**Trigger:** the navbar "cast" icon, shown when `currentsong.active && currentsong.players.length > 0`. It calls `openPopupLoad()`.

**Inputs:** `action = 'Turn on/off stream on other mpd/upnp renderers'`, `players = currentsong.players` (the same shared array).

**What the modal shows:** for each player, a three-way `mat-button-toggle-group`: `off` (`false`), `<player.name>` (`null`, meaning leave unchanged) and `on` (`true`). It has a single **OK** button and no cancel button (the backdrop or Esc still closes it).

**State:**
- `ngOnInit`: set `players[i].load = null` for every player, so the default is "no change".
- `updateLoad(event, location)`: when `event.value` is `true` or `false`, set `load` to that value. Choosing the `null` button does **not** set it back to `null`; it keeps the last `true`/`false`.
- **OK** emits `{ players }`, the whole mutated array.

**What the parent does:** for each `i`, `load === true` → `openStream(i)`, `load === false` → `stopStream(i)`, `null` → nothing.

### 4.3 Shared-state hazards and Svelte notes

- Both popups write `load` straight into `currentsong.players`. That array is replaced on every poll, so a poll that arrives while a popup is open throws away the selection the parent later reads by index. **Svelte:** keep the selection as local component state keyed by `player.location`, and pass the parent a list of locations, not indices.
- The play flow (on/off per player, opening only) and the renderer flow (off/unchanged/on per player) can share one inline overlay with a `mode` prop:
  - `confirm-play`: title, cover, optional renderer opt-in, Yes/Cancel.
  - `confirm-remove`: title, cover, Yes/Cancel.
  - `renderers`: tri-state per player, Apply.
- Actions after confirming, for the store:
  - `play(item, renderers[])` → `/addplay`, refresh the active view, poll once, `openStream` for each renderer.
  - `removeHistory(item)` → `/remove_history`, refresh the matching view.
  - `applyRenderers(map<location, 'on'|'off'>)` → `openStream` / `stopStream`.
- Toasts: success shows for 2 s, error for 5 s.

---

## 5. Legacy quirks to fix (not port)

1. `/addplay` sends `url`, `name` and `favicon` without URL encoding. Encode every param.
2. The `/cover` URL in the popup has no `mpd_port`.
3. `!currentsong.consume` tests the string `"0"`/`"1"`, so the prev button never appears. Parse it as a number.
4. Favourite flags depend on which `showDash()` response arrives first. Derive them from a favourites store.
5. The folder header favourite star goes stale after a toggle.
6. Alphabet groups are case-sensitive, and sorting uses the full path while grouping uses the title.
7. Grid mode has no alphabetical grouping (the Phase 5 goal).
8. Popups mutate the shared `players` array, and selections are tracked by index.
9. The Bandcamp play popup gets `artist` in its `stationuuid` argument.
10. Switching the poll interval on blur has no effect, and `stream_updated` is read from the payload instead of `localStorage`.
11. `searchItem_old` is dead code. The live search is `searchTerm$` with debounce 300 ms, `distinctUntilChanged` and `switchMap`, and the minimum is **3** characters (the README says 4).


### `/addplay?file=<library path>` (single track)

Appends one library file to the queue and calls play. Unlike `directory=`, no loading sound is added and no history entry is written. The path must be relative to the library: absolute paths, `..` segments and URL schemes get HTTP 400; a file MPD does not know gets 404. Used by the `+` button next to tracks in the Folders view and by the MCP tool `enqueue_file`.
