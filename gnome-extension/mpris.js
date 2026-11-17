import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'org.mpris.MediaPlayer2.audioloader';
const OBJ_PATH = '/org/mpris/MediaPlayer2';

const ROOT_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <method name="Quit"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
</node>`;

const PLAYER_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Pause"/>
    <method name="PlayPause"/>
    <method name="Stop"/>
    <method name="Play"/>
    <method name="Seek"><arg direction="in" type="x" name="Offset"/></method>
    <method name="SetPosition">
      <arg direction="in" type="o" name="TrackId"/>
      <arg direction="in" type="x" name="Position"/>
    </method>
    <method name="OpenUri"><arg direction="in" type="s" name="Uri"/></method>
    <signal name="Seeked"><arg type="x" name="Position"/></signal>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="LoopStatus" type="s" access="read"/>
    <property name="Rate" type="d" access="read"/>
    <property name="Shuffle" type="b" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanControl" type="b" access="read"/>
  </interface>
</node>`;

/** One fixed MPRIS player whose content follows the active profile. */
export class MprisPlayer {
    constructor(controller) {
        this._c = controller;
        this._state = null;
        this._artUrl = '';
        this._nameId = 0;
        this._conn = null;
        this._root = Gio.DBusExportedObject.wrapJSObject(ROOT_XML, this);
        this._impl = Gio.DBusExportedObject.wrapJSObject(PLAYER_XML, this);
    }

    enable() {
        this._nameId = Gio.bus_own_name(Gio.BusType.SESSION, BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            conn => {
                this._conn = conn;
                this._root.export(conn, OBJ_PATH);
                this._impl.export(conn, OBJ_PATH);
            },
            null,
            () => console.warn('audioloader: could not own MPRIS name'));
    }

    destroy() {
        this._root.unexport();
        this._impl.unexport();
        if (this._nameId)
            Gio.bus_unown_name(this._nameId);
        this._nameId = 0;
        this._conn = null;
    }

    /** Update from controller state; artUrl is a file:// URL or ''. */
    update(state, artUrl) {
        this._state = state;
        this._artUrl = artUrl ?? '';
        if (!this._conn)
            return;
        const v = (sig, val) => new GLib.Variant(sig, val);
        this._impl.emit_property_changed('PlaybackStatus', v('s', this.PlaybackStatus));
        this._impl.emit_property_changed('Metadata', this.Metadata);
        this._impl.emit_property_changed('Volume', v('d', this.Volume));
        this._impl.emit_property_changed('CanControl', v('b', this.CanControl));
        this._impl.emit_property_changed('CanPlay', v('b', this.CanPlay));
        this._impl.emit_property_changed('CanPause', v('b', this.CanPause));
        this._impl.emit_property_changed('CanGoNext', v('b', this.CanGoNext));
        this._impl.emit_property_changed('CanGoPrevious', v('b', this.CanGoPrevious));
    }

    // org.mpris.MediaPlayer2
    Raise() {}
    Quit() {}
    get CanQuit() { return false; }
    get CanRaise() { return false; }
    get HasTrackList() { return false; }
    get Identity() { return 'Audioloader'; }
    get DesktopEntry() { return ''; }
    get SupportedUriSchemes() { return []; }
    get SupportedMimeTypes() { return []; }

    // org.mpris.MediaPlayer2.Player
    Next() { this._c.command('next'); }
    Previous() { this._c.command('prev'); }
    Pause() { this._c.command('pause'); }
    PlayPause() { this._c.command('playpause'); }
    Stop() { this._c.command('stop'); }
    Play() { this._c.command('play'); }
    Seek(_o) {}
    SetPosition(_t, _p) {}
    OpenUri(_u) {}

    get PlaybackStatus() {
        switch (this._state?.state) {
        case 'play': return 'Playing';
        case 'pause': return 'Paused';
        default: return 'Stopped';
        }
    }
    get LoopStatus() { return 'None'; }
    get Rate() { return 1.0; }
    get Shuffle() { return false; }
    get MinimumRate() { return 1.0; }
    get MaximumRate() { return 1.0; }

    get Metadata() {
        const s = this._state;
        const id = (s?.songId || '0').replace(/\W/g, '_');
        const d = {'mpris:trackid': new GLib.Variant('o', `/org/audioloader/track/${id}`)};
        if (s && s.state !== 'stop') {
            d['xesam:title'] = new GLib.Variant('s', s.title);
            d['xesam:artist'] = new GLib.Variant('as', s.artist ? [s.artist] : []);
            d['xesam:album'] = new GLib.Variant('s', s.album);
            if (s.duration > 0)
                d['mpris:length'] = new GLib.Variant('x', Math.round(s.duration * 1e6));
            if (this._artUrl)
                d['mpris:artUrl'] = new GLib.Variant('s', this._artUrl);
        }
        return new GLib.Variant('a{sv}', d);
    }

    get Volume() { return (this._state?.volume ?? 100) / 100; }
    set Volume(v) { this._c.setVolume(Math.max(0, Math.min(1, v)) * 100); }
    get Position() { return Math.round(this._c.elapsed() * 1e6); }
    get CanGoNext() { return !!this._state; }
    get CanGoPrevious() { return !!this._state; }
    get CanPlay() { return !!this._state; }
    get CanPause() { return !!this._state; }
    get CanSeek() { return false; }
    get CanControl() { return !!this._state; }
}

