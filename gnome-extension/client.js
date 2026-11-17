import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const COMMANDS = new Set(['play', 'pause', 'playpause', 'next', 'prev', 'stop']);
const MAX_COVER_BYTES = 8 * 1024 * 1024;

export class AuthError extends Error {
    constructor(code) {
        super(code === 401 || code === 403
            ? `Authentication rejected (HTTP ${code})`
            : `Redirected (HTTP ${code}): the server wants authentication`);
        this.code = code;
    }
}

export function parseState(j) {
    const file = j.file ?? '';
    const name = j.Name ?? '';
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const vol = parseInt(j.volume, 10);
    return {
        state: j.state || 'stop',
        title: j.Title || name || file.split('/').pop(),
        artist: j.Artist || name,
        album: j.Album ?? '',
        file,
        songId: String(j.songid ?? j.Id ?? ''),
        elapsed: num(j.elapsed),
        duration: num(j.duration),
        volume: vol >= 0 && vol <= 100 ? vol : null,
        outputs: (j.outputs ?? []).map(o => ({
            id: String(o.outputid), name: o.outputname, enabled: String(o.outputenabled) === '1',
        })),
        snapcast: (j.snapcast_clients ?? []).map(c => ({
            id: String(c.id), name: c.name, connected: !!c.connected, muted: !!c.muted,
        })),
        receivedAt: GLib.get_monotonic_time() / 1000,
    };
}

export function elapsedAt(s, nowMs) {
    const extra = s.state === 'play' ? (nowMs - s.receivedAt) / 1000 : 0;
    const t = Math.max(0, s.elapsed + extra);
    return s.duration > 0 ? Math.min(t, s.duration) : t;
}

export function coverDirectory(s) {
    if (!(s.state === 'play' || s.state === 'pause') || !s.file || s.file.includes('://'))
        return null;
    const i = s.file.lastIndexOf('/');
    return i > 0 ? s.file.slice(0, i) : null;
}

export class Client {
    /** profile: {baseUrl, mpdServer, authMode, username}; secret: string from keyring. */
    constructor(profile, secret = '') {
        this._p = profile;
        this._secret = secret;
        this._session = new Soup.Session({timeout: 15, idle_timeout: 0});
        this._pollSession = new Soup.Session({timeout: 0, idle_timeout: 0});
        this._cancel = new Gio.Cancellable();
        this._base = profile.baseUrl.replace(/\/+$/, '');
    }

    destroy() {
        this._cancel.cancel();
        this._session.abort();
        this._pollSession.abort();
    }

    webUiUrl() { return `${this._base}/static/`; }

    _uri(endpoint, params = {}) {
        const q = {mpd_server: this._p.mpdServer.trim(), ...params};
        const qs = Object.entries(q)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        return `${this._base}/${endpoint}?${qs}`;
    }

    _message(uri) {
        const msg = Soup.Message.new('GET', uri);
        msg.set_flags(Soup.MessageFlags.NO_REDIRECT);
        const h = msg.get_request_headers();
        h.append('User-Agent', 'audioloader-gnome/1');
        switch (this._p.authMode) {
        case 'basic':
            h.append('Authorization', 'Basic ' + GLib.base64_encode(
                new TextEncoder().encode(`${this._p.username}:${this._secret}`)));
            break;
        case 'bearer':
            h.append('Authorization', `Bearer ${this._secret.trim()}`);
            break;
        case 'cookie':
            h.append('Cookie', this._secret);
            break;
        }
        return msg;
    }

    async _bytes(session, uri) {
        const msg = this._message(uri);
        const bytes = await new Promise((resolve, reject) => {
            session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, this._cancel, (s, res) => {
                try { resolve(s.send_and_read_finish(res)); } catch (e) { reject(e); }
            });
        });
        const code = msg.get_status();
        if ((code >= 300 && code < 400) || code === 401 || code === 403)
            throw new AuthError(code);
        if (code < 200 || code >= 300)
            throw new Error(`HTTP ${code}`);
        return bytes;
    }

    async _json(session, uri) {
        const bytes = await this._bytes(session, uri);
        return JSON.parse(new TextDecoder().decode(bytes.get_data()));
    }

    async currentSong() { return parseState(await this._json(this._session, this._uri('currentsong'))); }
    async pollCurrentSong() { return parseState(await this._json(this._pollSession, this._uri('poll_currentsong'))); }

    async command(name) {
        if (!COMMANDS.has(name)) throw new Error(`unknown command ${name}`);
        await this._bytes(this._session, this._uri(name));
    }

    async setVolume(v) {
        await this._bytes(this._session, this._uri('volume', {value: Math.max(0, Math.min(100, Math.round(v)))}));
    }

    async toggleOutput(id) { await this._bytes(this._session, this._uri('toggleoutput', {output: id})); }

    async toggleSnapcast(id, muted) {
        await this._bytes(this._session, this._uri('togglesnapcastclient', {id, muted: String(muted)}));
    }

    /** Returns GLib.Bytes or null when too large. */
    async cover(directory) {
        const b = await this._bytes(this._session, this._uri('cover', {directory}));
        return b.get_size() > MAX_COVER_BYTES ? null : b;
    }
}
