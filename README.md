# Introduction

Audioloader is a web based [Music Player Deamon](http://www.musicpd.org) (MPD) client with special focus on playing music organized in folders.

[![Screenshot](https://i.postimg.cc/6QgRm1wJ/Screenshot-From-2026-11-16-18-04-51.png)](https://postimg.cc/jW6LWcLZ)

The software has four components: a Go backend, a responsive web user interface written in Svelte, an optional [MCP service](mcp/README.md) so AI agents can control the player, and a native [Android remote](android/README.md).

The Go application is very thin, it does almost nothing but proxying requests towards the MPD server from the web client.

The application features multiple ways of selecting music from MPD and other sources (these are the seven views of the web UI, see [Use](#use)):

1. selecting folders from a browser
1. creating a random set of folders to choose music from (useful for large music libraries)
1. marking folders as favorite
1. selecting folders from the history
1. managing the play queue
1. select radio station from the [radio-browser.info](http://radio-browser.info) community radio database
1. play album from Bandcamp or Youtube (optional)

You can also search in the MPD database from the search bar of the folders view.

Running the Go application and serving the frontend on the same machine as MPD is the most straightforward option, though the setup isn't tied to a single host—you can just as easily run audioloader on a separate system. Any output method MPD supports will work. A common setup is installing everything on a Raspberry Pi or home server and configuring MPD with an HTTP stream output, letting you listen from any device. ⚠ Make sure to set the AL_DEFAULT_STREAM environment parameter to this stream's URL.

If your MPD server has multiple outputs configured, you can toggle them directly from the app.

If you're using a Snapcast server (a great option for multi-room audio with MPD), the application will automatically query its clients so you can mute or unmute them right from the interface.

# Installation

1. Install Redis

```bash
sudo apt install redis-server redis-tools
```

Redis is used to cache the name of folder images. It slightly improves performance of showing folder images, but it is not a must to install it, the application works without it.

2. Download the appropriate release, and unpack it.

3. Set environment variables

```bash
AL_BANDCAMP_ENABLED: true | false
AL_CLIENT_DB  where to store client favorites/history/random folders — the user running the web application needs to have write access on this directory
AL_DEFAULT_STREAM: url of the mpd lame/vorbis stream (httpd output) configured ~ can be overriden from the web UI settings
AL_MPD_HOST: hostname of your mpd server
AL_MPD_PORT: mpd server port ~ the default server, can be overriden per client with `mpd_server`
AL_LISTENING_PORT: where the backend should lister
AL_LIBRARY_PATH: the application will look in this folder for your music repository when it returns cover art
AL_SNAPCAST_HOST: the application well query this Snapcast server for clients
AL_LOG_LEVEL: audioloader log level
```

For simple use only variables `AL_CLIENT_DB` and `AL_LIBRARY_PATH` are required to be set.

4. Run audioloader

The web UI is served by the backend itself (from the `static` folder) — no separate web server is needed, but you can put one (nginx, Caddy) in front of it for HTTPS. The UI is installable as a PWA (needs HTTPS or localhost).

5. Choosing the MPD server

Every API call accepts `mpd_server=host:port` (default `localhost:6600`, or `AL_MPD_HOST`:`AL_MPD_PORT`). The port may be omitted (`mpd_server=rpi.local`), IPv6 is written `[::1]:6600`. This is how every client picks its MPD server: the web UI in the settings, the Android app in the profile, the MCP service with `AL_MCP_MPD_SERVER`.

6. Bandcamp and Youtube support

You need to install `yt-dlp` for working Bandcamp / Youtube support. 

```bash
uv tool install "yt-dlp[default,curl-cffi]"
```

Bandcamp needs `curl-cffi` and sometimes a pinned browser target; see [BANDCAMP.md](BANDCAMP.md).

This part of the code is not supported at all, it might break anytime.

## systemd control

If you want to have systemd to control the service you can install and customize the `audioloader.service` unit file in the repository.

## You've been warned

No responsibility on my side for any damage. The application is intended to be used in friendly or appropriately protected network environment.

# Upgrade

Audioloader is distributed in this Git repository. New features are developed against branches, thus you can rely on the master HEAD until further notice. I try to make release builds from time to time.

# Use

If you run the application standalone, you just need to visit http://localhost:3400 after starting it.

On a wide screen there is a sidebar with the seven views, on a phone they are in a bottom bar. The player bar shows the currently playing song with the media controls, a volume control and, if you have them, your MPD outputs and Snapcast clients.

## The seven views

- **Folders**: the directory browser, it speaks for itself. Folders with few sub-directories are shown with cover art, large ones as a list.
- **Random**: 12 random albums from your MPD database, important if you have a large library and you just want to listen to something. The set is persistent, but only one exists at the same time for a client; the refresh button generates a new one and the old one is lost.
- **Favorites**: the folders you marked as favorite, as many as you want.
- **History**: the last 50 loaded folders (this is the default view).
- **Queue**: what is waiting to be played. You can add single tracks or whole albums to it, and remove things from it. Albums, radio stations and Bandcamp albums are added to the end of the queue. At the moment the application plays in consume mode, ie. played tracks leave the queue.
- **Radio**: search and load radio stations from the [radio-browser.info](http://radio-browser.info) community radio database; the last 10 started station is displayed in the history.
- **Bandcamp**: your Bandcamp / Youtube history. You can paste a Bandcamp album URL here (or in the search box) to play it directly, see [BANDCAMP.md](BANDCAMP.md) if it doesn't work.

## Settings

The user button opens the settings dialog. Everything here is stored on the device, except the user's favorites, history and random set, which are stored on the server.

- **User**: your id (the `client_id`). It identifies your history / random album selection and favorites on the server, so that you can use the application from several devices — and have separate lists for everybody in the family. You can pick an existing user or create a new one.
- **MPD server** (`host:port`): which MPD server this device talks to, default `localhost:6600`. (Tip: if you have a family, you can set up separate MPD server for everybody — it's not complicated.) Changing it reloads the views.
- **Theme**: system, light or dark.

## MCP (AI agents)

The optional `audioloader-mcp` service lets an AI agent (Claude, Cline, Gemini CLI, ...) see what is playing, search and browse the library, start albums, manage the queue and favorites, and so on. It is a separate small Go process which talks to the audioloader HTTP API, so if you don't need it, just don't run it. Everything is documented in [mcp/README.md](mcp/README.md), here is the short version:

```bash
cd mcp && go build -o ../audioloader-mcp .
openssl rand -base64 33 | tr '+/' '-_'     # your secret
AL_MCP_PATH="/mcp/<secret>" AL_MCP_CLIENT_ID=kris ../audioloader-mcp
```

There is no login: the secret path in the URL is the credential, and it is bound to one `client_id`. Treat the URL like a password and publish it over HTTPS only. Because every URL starts with `/mcp/`, one generic rule in your reverse proxy sends all of them to the MCP service and everything else to audioloader (reverse proxy examples for nginx and Caddy are in the MCP README). `AL_MCP_READONLY=true` hides all the tools that change anything. A systemd unit is in `audioloader-mcp.service`.

To add it to an agent, you just need the URL:

```bash
claude mcp add --transport http audioloader https://music.example.org/mcp/<secret>
```

or in the JSON config of any agent that supports remote servers:

```json
{ "mcpServers": { "audioloader": { "url": "https://music.example.org/mcp/<secret>" } } }
```

(Gemini CLI wants `httpUrl`, Cline `streamableHttp`, Claude Desktop can add it as a custom connector.)

## Android remote

A native Android remote control lives in [`android/`](android/README.md). It does not browse the library (use the web UI for that), it mirrors what MPD is playing and controls it: media notification and lock screen controls, headset buttons, now playing with cover art, queue, outputs and Snapcast rooms. It can pause the music when a Bluetooth device (earbuds, car) disconnects. You can have several server profiles, each with its own MPD server, user and authentication (none, basic, bearer token or cookie). Signed APKs are attached to GitHub releases tagged `android-v*`.

# TODO / ISSUES

- At the moment the application plays in consume mode, ie. there is no rewind option

# Development

```bash
# backend
go test . && go build

# web UI (Svelte), see svelte-frontend/README.md
cd svelte-frontend
npm ci
npm run dev          # dev server on http://localhost:5173
./build.sh           # build and install into ../static
```

The backend API is described in [MPD_API_MAPPING.md](MPD_API_MAPPING.md).

# About
The application was created by Kristof Imre Szabo.
