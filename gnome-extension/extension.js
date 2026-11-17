import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import GLib from 'gi://GLib';

import {Controller} from './controller.js';
import {MprisPlayer} from './mpris.js';
import {coverDirectory} from './client.js';
import {Indicator} from './indicator.js';
import {activeProfile, validateProfile} from './profiles.js';
import {lookupSecret} from './secrets.js';

export default class AudioloaderExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._controller = new Controller(
            s => this._onState(s),
            (k, m) => this._setStatus(k, m));
        this._status = ['online', ''];

        this._mpris = new MprisPlayer(this._controller);
        this._mpris.enable();
        this._purgeStaleCovers();
        this._artPath = '';

        this._syncIndicator();

        this._ids = ['profiles', 'active-profile', 'show-indicator'].map(k =>
            this._settings.connect(`changed::${k}`,
                () => (k === 'show-indicator' ? this._syncIndicator() : this._reload())));
        this._reload();
    }

    disable() {
        for (const id of this._ids ?? [])
            this._settings.disconnect(id);
        this._ids = null;
        this._reloadGen = (this._reloadGen ?? 0) + 1;
        this._controller?.destroy();
        this._controller = null;
        this._mpris?.destroy();
        this._mpris = null;
        this._clearArt();
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }

    _onState(s) {
        this._state = s;
        this._indicator?.update(s);
        this._mpris?.update(s, this._artPath ? `file://${this._artPath}` : '');
        this._loadArt(s);
    }

    async _loadArt(s) {
        const dir = s ? coverDirectory(s) : null;
        if (dir === this._artFor)
            return;
        this._artFor = dir;
        this._clearArt();
        const client = this._controller?.client;
        if (!dir || !client)
            return;
        try {
            const bytes = await client.cover(dir);
            if (!bytes || dir !== this._artFor || !this._mpris)
                return;
            const path = GLib.build_filenamev([GLib.get_tmp_dir(), `audioloader-cover-${GLib.uuid_string_random()}`]);
            GLib.file_set_contents(path, bytes.get_data());
            this._artPath = path;
            this._indicator?.setCover(path);
            this._mpris.update(this._controller.state, `file://${path}`);
        } catch (e) {
            console.warn(`audioloader: cover failed: ${e.message}`);
        }
    }

    _purgeStaleCovers() {
        try {
            const dir = Gio.File.new_for_path(GLib.get_tmp_dir());
            const en = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = en.next_file(null))) {
                if (info.get_name().startsWith('audioloader-cover-'))
                    dir.get_child(info.get_name()).delete(null);
            }
        } catch (e) {
            console.warn(`audioloader: cover purge failed: ${e.message}`);
        }
    }

    _clearArt() {
        if (this._artPath)
            GLib.unlink(this._artPath);
        this._artPath = '';
        this._indicator?.setCover(null);
        if (!this._mpris)
            this._artFor = null;
    }

    _setStatus(kind, message) {
        this._status = [kind, message];
        this._indicator?.setStatus(kind, message);
    }

    _syncIndicator() {
        const want = this._settings.get_boolean('show-indicator');
        if (!want) {
            this._indicator?.destroy();
            this._indicator = null;
            return;
        }
        if (this._indicator)
            return;
        this._indicator = new Indicator({
            controller: this._controller,
            settings: this._settings,
            openWebUi: () => this._openWebUi(),
            openPrefs: () => this.openPreferences(),
            selectProfile: id => this._settings.set_string('active-profile', id),
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._indicator.update(this._state ?? null);
        this._indicator.setStatus(...this._status);
        if (this._artPath)
            this._indicator.setCover(this._artPath);
    }

    async _reload() {
        const gen = this._reloadGen = (this._reloadGen ?? 0) + 1;
        this._indicator?.rebuildProfiles();
        const p = activeProfile(this._settings);
        if (!p) {
            this._controller.setProfile(null);
            return;
        }
        const err = validateProfile(p);
        if (err) {
            this._controller.setProfile(null);
            this._indicator.setStatus('offline', err);
            return;
        }
        let secret = '';
        if (p.authMode !== 'none') {
            try {
                secret = await lookupSecret(p.id);
            } catch (e) {
                console.error(`audioloader: keyring lookup failed: ${e.message}`);
            }
        }
        if (gen !== this._reloadGen || !this._controller)
            return;
        this._profile = p;
        this._controller.setProfile(p, secret);
    }

    _openWebUi() {
        const c = this._controller?.client;
        if (c)
            Gio.AppInfo.launch_default_for_uri(c.webUiUrl(), null);
    }
}
