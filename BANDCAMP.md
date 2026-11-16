# Bandcamp (and YouTube) support

Audioloader resolves Bandcamp and YouTube links with [`yt-dlp`](https://github.com/yt-dlp/yt-dlp). It runs `yt-dlp -f bestaudio -g <url>` for every play request and queues the stream URLs it prints in MPD. `yt-dlp` must therefore be on the `PATH` of the audioloader process.

Set `AL_BANDCAMP_ENABLED: true` to show the Bandcamp view.

## Installing yt-dlp

The simplest way is [`uv`](https://docs.astral.sh/uv/):

```sh
uv tool install "yt-dlp[default,curl-cffi]"
```

- `curl-cffi` is needed for Bandcamp (see below), and `default` adds the other recommended extras.
- Upgrade with `uv tool upgrade yt-dlp`. Bandcamp changes often, so keep it current.
- uv puts the executable in `~/.local/bin`. If audioloader runs as a service, make sure that directory is in the service's `PATH`.
- Alternative: the standalone binary from the [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases). It bundles `curl_cffi`, so no extra setup is needed.

## Impersonation error

Bandcamp requires yt-dlp to impersonate a browser. Without `curl_cffi` you get:

```
ERROR: [Bandcamp:album] ...: The extractor is attempting impersonation, but no impersonate target is available.
```

If `curl_cffi` is installed, but you get:

```
ERROR: [Bandcamp:album] ...: Got client challenge webpage response with chrome-152:windows-10; please report this issue
```

then yt-dlp picked a browser fingerprint that Bandcamp rejects. Pin a working one in a yt-dlp config file for the user that runs audioloader:

```sh
mkdir -p ~/.config/yt-dlp
echo '--impersonate chrome-136' >> ~/.config/yt-dlp/config
```

This applies to every yt-dlp run by that user. If `chrome-136` stops working, list the available targets with `yt-dlp --list-impersonate-targets` and try another (`chrome-133` and `safari-18.4` also worked).

## Checking it

Run the same command as the user that runs audioloader:

```sh
yt-dlp -f bestaudio -g https://<artist>.bandcamp.com/album/<album>
```

It should print one stream URL per track. If this fails, audioloader fails too. The server logs yt-dlp's error and returns it to the browser as HTTP 502.

## Notes

- Bandcamp stream URLs are signed and expire after a few hours, so a queue left idle for a long time may stop playing.
- Depending on the album, `bestaudio` returns a lossless download (e.g. ALAC) or the 128 kbps MP3 stream. MPD plays both.
