import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import GLib from 'gi://GLib';

import {loadProfiles} from './profiles.js';

const COVER_SIZE = 160;

export const Indicator = GObject.registerClass(
class AudioloaderIndicator extends PanelMenu.Button {
    /** host: {controller, settings, openWebUi(), openPrefs(), selectProfile(id)} */
    _init(host) {
        super._init(0.5, 'Audioloader');
        this._host = host;
        this._icon = new St.Icon({icon_name: 'audio-x-generic-symbolic', style_class: 'system-status-icon'});
        this.add_child(this._icon);

        const coverItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        this._cover = new St.Icon({
            icon_name: 'audio-x-generic-symbolic', icon_size: COVER_SIZE,
            x_expand: true, x_align: Clutter.ActorAlign.CENTER,
        });
        coverItem.add_child(this._cover);
        this.menu.addMenuItem(coverItem);

        this._title = new PopupMenu.PopupMenuItem('Not connected', {reactive: false});
        this._title.label.x_expand = true;
        this._title.label.x_align = Clutter.ActorAlign.CENTER;
        this._title.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.menu.box.style = 'max-width: 22em;';
        this.menu.addMenuItem(this._title);
        this._status = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._status.hide();
        this.menu.addMenuItem(this._status);

        const row = new PopupMenu.PopupBaseMenuItem({reactive: false});
        const mk = (icon, cmd) => {
            const b = new St.Button({
                child: new St.Icon({icon_name: icon, icon_size: 20}),
                style_class: 'button', x_expand: true, can_focus: true,
            });
            b.connect('clicked', () => host.controller.command(cmd));
            row.add_child(b);
            return b;
        };
        mk('media-skip-backward-symbolic', 'prev');
        this._playBtn = mk('media-playback-start-symbolic', 'playpause');
        mk('media-playback-stop-symbolic', 'stop');
        mk('media-skip-forward-symbolic', 'next');
        this.menu.addMenuItem(row);

        this._volItem = new PopupMenu.PopupBaseMenuItem({activate: false});
        this._volItem.add_child(new St.Icon({icon_name: 'audio-volume-high-symbolic', style_class: 'popup-menu-icon'}));
        this._slider = new Slider(0);
        this._slider.x_expand = true;
        this._volItem.add_child(this._slider);
        this._volSetting = false;
        this._volTimer = 0;
        this._slider.connect('notify::value', () => this._onSlider());
        this._volItem.connect('key-press-event', (_a, ev) => this._slider.emit('key-press-event', ev));
        this.menu.addMenuItem(this._volItem);

        this._profiles = new PopupMenu.PopupSubMenuMenuItem('Profile');
        this.menu.addMenuItem(this._profiles);
        this._outputs = new PopupMenu.PopupSubMenuMenuItem('Outputs');
        this.menu.addMenuItem(this._outputs);
        this._snap = new PopupMenu.PopupSubMenuMenuItem('Snapcast');
        this.menu.addMenuItem(this._snap);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Preferences', () => host.openPrefs());
        this.menu.addAction('Open web UI', () => host.openWebUi());

        this._tip = null;
        this._tipTimer = 0;
        this._tipText = '';
        this.connect('enter-event', () => this._scheduleTip());
        this.connect('leave-event', () => this._hideTip());
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._hideTip();
        });
        this._sigs = ['cover-in-panel', 'show-tooltip'].map(k =>
            host.settings.connect(`changed::${k}`, () => {
                this._applyPanelIcon();
                this._hideTip();
            }));

        this.rebuildProfiles();
        this.update(null);
    }

    _scheduleTip() {
        if (this._tipTimer || this.menu.isOpen || !this._tipText ||
            !this._host.settings.get_boolean('show-tooltip'))
            return;
        this._tipTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._tipTimer = 0;
            this._showTip();
            return GLib.SOURCE_REMOVE;
        });
    }

    _showTip() {
        if (!this._tipText || this.menu.isOpen)
            return;
        if (!this._tip) {
            this._tip = new St.Label({style_class: 'dash-label', style: 'max-width: 28em;'});
            this._tip.clutter_text.line_wrap = true;
            Main.layoutManager.addTopChrome(this._tip);
        }
        this._tip.text = this._tipText;
        this._tip.show();
        const [x, y] = this.get_transformed_position();
        const [w, h] = this.get_transformed_size();
        const [tw] = this._tip.get_size();
        const monitor = Main.layoutManager.findMonitorForActor(this);
        const px = Math.max(monitor.x, Math.min(Math.round(x + (w - tw) / 2), monitor.x + monitor.width - tw));
        this._tip.set_position(px, Math.round(y + h + 4));
    }

    _hideTip() {
        if (this._tipTimer) {
            GLib.source_remove(this._tipTimer);
            this._tipTimer = 0;
        }
        this._tip?.hide();
    }

    destroy() {
        this._hideTip();
        if (this._volTimer) {
            GLib.source_remove(this._volTimer);
            this._volTimer = 0;
        }
        for (const id of this._sigs ?? [])
            this._host.settings.disconnect(id);
        this._sigs = null;
        this._tip?.destroy();
        this._tip = null;
        super.destroy();
    }

    _onSlider() {
        if (this._volSetting)
            return;
        this._userVol = true;
        if (this._volTimer)
            GLib.source_remove(this._volTimer);
        this._volTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._volTimer = 0;
            this._host.controller.setVolume(this._slider.value * 100);
            this._userVol = false;
            return GLib.SOURCE_REMOVE;
        });
    }

    rebuildProfiles() {
        this._profiles.menu.removeAll();
        const active = this._host.settings.get_string('active-profile');
        const list = loadProfiles(this._host.settings);
        for (const p of list) {
            const item = new PopupMenu.PopupMenuItem(p.name);
            item.setOrnament(p.id === active || (!active && p === list[0])
                ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
            item.connect('activate', () => this._host.selectProfile(p.id));
            this._profiles.menu.addMenuItem(item);
        }
        this._profiles.visible = list.length > 1;
    }

    /** path: local image file, or null to fall back to the generic icon. */
    setCover(path) {
        if (path) {
            const icon = new Gio.FileIcon({file: Gio.File.new_for_path(path)});
            this._cover.gicon = icon;
            this._coverIcon = icon;
        } else {
            this._coverIcon = null;
            this._cover.gicon = null;
            this._cover.icon_name = 'audio-x-generic-symbolic';
        }
        this._applyPanelIcon();
    }

    _applyPanelIcon() {
        const useCover = this._host.settings.get_boolean('cover-in-panel') && this._coverIcon;
        if (useCover) {
            this._icon.gicon = this._coverIcon;
        } else {
            this._icon.gicon = null;
            this._icon.icon_name = 'audio-x-generic-symbolic';
        }
    }

    setStatus(kind, message) {
        const bad = kind !== 'online';
        this._status.label.text = kind === 'auth' ? `Authentication problem: ${message}` : `Offline: ${message}`;
        this._status.visible = bad;
        this._icon.opacity = bad ? 128 : 255;
    }

    update(s) {
        const hasVol = s?.volume != null;
        this._volItem.visible = hasVol;
        if (hasVol && !this._userVol) {
            this._volSetting = true;
            this._slider.value = s.volume / 100;
            this._volSetting = false;
        }
        this._playBtn.child.icon_name = s?.state === 'play'
            ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        const line = s && s.state !== 'stop'
            ? [s.artist, s.title].filter(Boolean).join(' - ') : 'Stopped';
        this._title.label.text = line;
        this._tipText = s && s.state !== 'stop'
            ? [s.title, s.artist, s.album].filter(Boolean).join('\n') : '';
        if (this._tip?.visible) {
            if (this._tipText)
                this._tip.text = this._tipText;
            else
                this._hideTip();
        }

        this._outputs.menu.removeAll();
        for (const o of s?.outputs ?? []) {
            const it = new PopupMenu.PopupSwitchMenuItem(o.name, o.enabled);
            it.connect('toggled', () => this._host.controller.toggleOutput(o.id));
            this._outputs.menu.addMenuItem(it);
        }
        this._outputs.visible = (s?.outputs.length ?? 0) > 0;

        this._snap.menu.removeAll();
        for (const c of s?.snapcast ?? []) {
            const it = new PopupMenu.PopupSwitchMenuItem(c.name, !c.muted);
            it.setSensitive(c.connected);
            it.connect('toggled', (_i, on) => this._host.controller.toggleSnapcast(c.id, !on));
            this._snap.menu.addMenuItem(it);
        }
        this._snap.visible = (s?.snapcast.length ?? 0) > 0;
    }
});
