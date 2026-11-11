# audioloader-mcp

An [MCP](https://modelcontextprotocol.io) server for [audioloader](../README.md), written in Go.
It is a **separate, optional process**: it calls the audioloader HTTP API (by default on
`127.0.0.1:3400`) and serves MCP over HTTP on `127.0.0.1:3401`. Users who don't need MCP simply don't run it.

Agents connect by URL, so there is no per-agent process to spawn and nothing to clean up.
It is stateless: no sessions accumulate.

## Authentication: the URL is the secret

Each user gets a long, unpredictable **path**. The MCP endpoint exists only at that path and
is bound to that user's `client_id` (their favourites and history). Every other path returns a
plain 404. Use HTTPS in front of it, and treat the URL like a password.

Generate one: `openssl rand -base64 33 | tr '+/' '-_'` (slashes inside the path are fine too).
Secrets shorter than 20 characters are refused at startup. To rotate a secret, change it and restart.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `AL_MCP_PATH` + `AL_MCP_CLIENT_ID` | (none) / `guest` | A single user |
| `AL_MCP_ROUTES` | (none) | Several users: `path1=client1,path2=client2` |
| `AL_MCP_ROUTES_FILE` | (none) | One `path client_id` per line, `#` comments. Keeps secrets out of the unit file; `chmod 600` it |
| `AL_MCP_PORT` | `3401` | Listen port (on `127.0.0.1`) |
| `AL_MCP_LISTEN` | `127.0.0.1:<port>` | Full listen address, overrides the port |
| `AL_MCP_UPSTREAM` | `http://127.0.0.1:3400` | audioloader base URL |
| `AL_MCP_MPD_PORT` | `6600` | `mpd_port` sent upstream |
| `AL_MCP_READONLY` | `false` | `true` exposes only the 12 read tools |
| `AL_MCP_TIMEOUT_MS` | `10000` | Upstream timeout |
| `AL_MCP_UPSTREAM_COOKIE` | (none) | Optional `Cookie` header for the upstream (e.g. `audioloadermagic=...`) |
| `AL_MCP_UPSTREAM_BEARER` | (none) | Optional `Authorization: Bearer ...` for the upstream |
| `AL_MCP_UPSTREAM_BASIC_USER` / `_PASSWORD` | (none) | Optional `Authorization: Basic ...` (not with Bearer) |

The `AL_MCP_UPSTREAM_*` settings are only needed if the upstream sits behind an auth layer
(for example when `AL_MCP_UPSTREAM` points at the public HTTPS URL). The paths are never logged.

## Build and run

```sh
cd mcp
go test ./...
go build -o ../audioloader-mcp .
AL_MCP_PATH="$(openssl rand -base64 33 | tr '+/' '-_')/mcp" AL_MCP_CLIENT_ID=kris ../audioloader-mcp
```

A systemd user unit is in [`../audioloader-mcp.service`](../audioloader-mcp.service).

## Reverse proxy (nginx)

Forward the secret prefix to the MCP service. Turn off access logging for it (the URL is the
credential) and disable buffering. Put this in your real site config, not in git:

```nginx
location /PUT-THE-SECRET-HERE/ {
    proxy_pass http://127.0.0.1:3401;   # no trailing slash: the full path is forwarded
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 300s;
    access_log off;
}
```

If your secret is `abc.../mcp` then the `location` can be the whole path or just a prefix of it.

## Agent configuration

The agent just needs the URL:

```json
{
  "mcpServers": {
    "audioloader": { "url": "https://al.example.com/PUT-THE-SECRET-HERE/mcp" }
  }
}
```

- **Cline:** remote server with type `streamableHttp` and that `url`.
- **Gemini CLI:** use `"httpUrl"` instead of `"url"`.
- **Claude Desktop:** add it as a custom connector, or bridge with `npx mcp-remote <url>`.

## Tools

Read-only: `now_playing`, `browse_folder`, `search_library`, `get_favourites`, `get_history`,
`get_random_set`, `search_radio`, `get_radio_history`, `lookup_bandcamp`, `get_bandcamp_history`,
`list_outputs`, `list_snapcast_clients`, `get_queue`.

Write (hidden with `AL_MCP_READONLY=true`): `play`, `pause`, `play_pause`, `next`, `previous`,
`stop`, `play_album`, `new_random_set`, `add_favourite`, `remove_favourite`, `play_radio`,
`play_bandcamp`, `enqueue_file`, `toggle_output`, `set_snapcast_mute`.

- `play_album`, `play_radio` and `play_bandcamp` **add to the queue** and start playback (they do not clear it). `enqueue_file` appends a single track instantly; `get_queue` shows what is waiting.
- Lists are capped at 50 entries (the result says when it was cut); history is newest first.
- `lookup_bandcamp` needs `yt-dlp` on the audioloader server.

## Layout

`config.go` env and routes, `client.go` upstream HTTP, `format.go`/`format_lists.go` payload shaping,
`tools*.go` the tools, `main.go` the HTTP server and secret-path routing. Tests use `httptest` mocks.
