# audioloader remote (Android)

A small native remote control for an [audioloader](../README.md) server. MPD plays the audio; the app
mirrors its state and sends HTTP commands, so it provides:

- a system media notification, lock-screen controls and headset buttons (media3 `MediaSession`)
- pause when a Bluetooth audio device disconnects (optional resume when the same device returns)
- several server profiles, each with its own authentication
- now playing with cover art, queue, MPD outputs, Snapcast rooms, and "open full UI"

It does not browse the library: use the web UI (button in the app) to pick albums.

## Profiles and authentication

| Field | Meaning |
|---|---|
| Base URL | `https://music.example.org` (no path) |
| MPD server | `host:port` (default `localhost:6600`), sent as `mpd_server` on every call |
| client_id | per-user favourites/history, `[A-Za-z0-9_.-]+` |
| Authentication | none, HTTP basic, bearer token, or cookie |

- A cookie value without `name=` is sent as `audioloadermagic=<value>`.
- Redirects are never followed. A 3xx, 401 or 403 is shown as "authentication rejected".
- Credentials are kept in encrypted preferences and sent only as request headers, never in URLs or logs.
- Credentials over plain `http://` are refused except for `localhost`/`127.0.0.1` (e.g. a server in Termux).
  Cleartext traffic is only permitted to those two hosts.

## Transport

`/poll_currentsong` is a long poll: the server answers on the next MPD event or after 60 s. The app
re-issues it at least 1 s apart, takes a `/currentsong` snapshot on start and after every command and
error, backs off 2 s .. 30 s while offline, and extrapolates the elapsed time locally. The loop runs only
while the activity is visible or the media service is running.

## Build

Requires JDK 17 and the Android SDK (platform 35). No wrapper is committed; use Gradle 8.10+.

```sh
cd android
gradle testDebugUnitTest assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

## Release

Push a tag `android-vX.Y.Z` (a tag with `-` such as `android-v1.2.0-rc1` is marked as a pre-release):

```sh
git tag android-v1.2.3 && git push origin android-v1.2.3
```

`.github/workflows/android-release.yml` runs the unit tests, builds a signed APK and attaches it to a
GitHub release. `versionName` comes from the tag, `versionCode` from the time of the build.

Repository secrets required:

| Secret | Content |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_ALIAS` | key alias |
| `KEY_PASSWORD` | key password |

Create a keystore once and keep it safe; updates must be signed with the same key:

```sh
keytool -genkeypair -v -keystore release.jks -alias audioloader -keyalg RSA -keysize 4096 -validity 10000
```

`.github/workflows/android-ci.yml` runs tests, lint and a debug build on pushes and pull requests that touch `android/`.

## Bluetooth

The rule belongs to the profile, because it only matters when that server's music plays on the phone
(earbuds, headphones, car). In the profile editor tick any number of paired devices; when one of them
disconnects while that profile is active and playing, the app pauses MPD, and optionally resumes when the
same device reconnects. With no device ticked the rule is off. Disconnects of other devices, or while another
profile is active, are ignored.

This needs the `BLUETOOTH_CONNECT` permission (Android 12+); the app asks on first start.

## Notification

While something is playing or paused, a media notification with previous / play-pause / next appears in the
shade and on the lock screen. Tapping it opens the app. It disappears when playback is stopped.
