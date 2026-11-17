import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {AUTH_MODES, loadProfiles, saveProfiles, newProfile, validateProfile} from './profiles.js';
import {lookupSecret, storeSecret, clearSecret} from './secrets.js';

export default class AudioloaderPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Profiles', icon_name: 'audio-x-generic-symbolic'});
        window.add(page);
        window._settings = settings;

        const general = new Adw.PreferencesGroup({title: 'General'});
        const showRow = new Adw.SwitchRow({
            title: 'Show panel icon',
            subtitle: 'Cover, profile switcher and outputs. The media card in the date menu stays either way.',
        });
        settings.bind('show-indicator', showRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        general.add(showRow);
        const coverRow = new Adw.SwitchRow({
            title: 'Album cover as panel icon',
            subtitle: 'Replace the music icon with the cover of the current album.',
        });
        settings.bind('cover-in-panel', coverRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        general.add(coverRow);
        const tipRow = new Adw.SwitchRow({
            title: 'Song info on hover',
            subtitle: 'Show title, artist and album when the pointer rests on the panel icon.',
        });
        settings.bind('show-tooltip', tipRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        general.add(tipRow);
        page.add(general);

        let groups = [];
        const rebuild = () => {
            for (const g of groups)
                page.remove(g);
            groups = [];
            const list = loadProfiles(settings);
            const active = settings.get_string('active-profile') || list[0]?.id;
            for (const p of list) {
                const g = this._profileGroup(window, settings, p, p.id === active, rebuild);
                page.add(g);
                groups.push(g);
            }
            const add = new Adw.PreferencesGroup();
            const row = new Adw.ButtonRow({title: 'Add profile'});
            row.connect('activated', () => {
                const l = loadProfiles(settings);
                const np = newProfile();
                l.push(np);
                saveProfiles(settings, l);
                if (l.length === 1)
                    settings.set_string('active-profile', np.id);
                rebuild();
            });
            add.add(row);
            page.add(add);
            groups.push(add);
        };
        rebuild();
    }

    _entry(group, title, value, onChange, opts = {}) {
        const row = opts.password ? new Adw.PasswordEntryRow({title}) : new Adw.EntryRow({title});
        row.text = value;
        row.connect('changed', () => onChange(row.text));
        group.add(row);
        return row;
    }

    _profileGroup(window, settings, p, isActive, rebuild) {
        const group = new Adw.PreferencesGroup({title: p.name});
        const update = patch => {
            const l = loadProfiles(settings);
            const i = l.findIndex(x => x.id === p.id);
            if (i < 0)
                return;
            Object.assign(l[i], patch);
            Object.assign(p, patch);
            saveProfiles(settings, l);
        };

        const useRow = new Adw.SwitchRow({title: 'Active profile', active: isActive});
        useRow.connect('notify::active', () => {
            if (useRow.active && !isActive) {
                settings.set_string('active-profile', p.id);
                rebuild();
            }
        });
        group.add(useRow);

        this._entry(group, 'Name', p.name, v => {
            update({name: v});
            group.title = v;
        });
        this._entry(group, 'Base URL', p.baseUrl, v => update({baseUrl: v.trim()}));
        this._entry(group, 'MPD server (host:port)', p.mpdServer, v => update({mpdServer: v.trim()}));
        this._entry(group, 'Client id', p.clientId, v => update({clientId: v.trim()}));

        const auth = new Adw.ComboRow({
            title: 'Authentication',
            model: Gtk.StringList.new(['None', 'HTTP basic', 'Bearer token', 'Cookie']),
            selected: Math.max(0, AUTH_MODES.indexOf(p.authMode)),
        });
        group.add(auth);
        const user = this._entry(group, 'Username', p.username ?? '', v => update({username: v}));
        const secret = this._entry(group, 'Secret', '', () => {}, {password: true});
        const save = new Adw.ButtonRow({title: 'Save secret to keyring'});
        group.add(save);
        const sync = () => {
            const m = AUTH_MODES[auth.selected];
            user.visible = m === 'basic';
            secret.visible = save.visible = m !== 'none';
            secret.title = m === 'cookie' ? 'Cookie header' : m === 'bearer' ? 'Token' : 'Password';
        };
        auth.connect('notify::selected', () => {
            update({authMode: AUTH_MODES[auth.selected]});
            sync();
        });
        sync();

        save.connect('activated', async () => {
            try {
                await storeSecret(p.id, p.name, secret.text);
                secret.text = '';
                window.add_toast(new Adw.Toast({title: 'Secret saved to keyring'}));
            } catch (e) {
                window.add_toast(new Adw.Toast({title: `Keyring error: ${e.message}`}));
            }
        });

        const test = new Adw.ButtonRow({title: 'Check settings'});
        test.connect('activated', () => {
            const err = validateProfile(p);
            window.add_toast(new Adw.Toast({title: err ?? 'Settings look valid'}));
        });
        group.add(test);

        const del = new Adw.ButtonRow({title: 'Delete profile'});
        del.add_css_class('destructive-action');
        del.connect('activated', () => {
            const l = loadProfiles(settings).filter(x => x.id !== p.id);
            saveProfiles(settings, l);
            if (settings.get_string('active-profile') === p.id)
                settings.set_string('active-profile', l[0]?.id ?? '');
            clearSecret(p.id).catch(() => {});
            rebuild();
        });
        group.add(del);
        return group;
    }
}
