# Audioloader Remote (GNOME Shell extension)

Remote control for an Audioloader server. GNOME 45+ only.

- Panel menu: cover art, now playing, prev/play-pause/stop/next, volume slider, profile switcher (with several profiles), MPD outputs, Snapcast mute, web UI link.
- Optional: album cover as the panel icon, song info popup on hover, hide the panel icon (all in Preferences).
- MPRIS player `org.mpris.MediaPlayer2.audioloader`: media widget, lock screen and media keys follow the active profile.
- Multiple profiles (Preferences). Auth: none, HTTP basic, bearer, cookie. Secrets are stored in the GNOME keyring only.
- Redirects are never followed; 3xx/401/403 shows an authentication error.
- Plain http with credentials is refused except for localhost.

Not packaged yet: install from this folder as described below.

## Install for development

    ln -s "$PWD" ~/.local/share/gnome-shell/extensions/audioloader@xksh.org
    glib-compile-schemas schemas
    # log out/in, then:
    gnome-extensions enable audioloader@xksh.org

Test in a nested shell: `dbus-run-session -- gnome-shell --devkit --wayland`.

Package: `gnome-extensions pack --force --extra-source=*.js .`
