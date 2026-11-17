import GLib from 'gi://GLib';

import {Client, AuthError, elapsedAt} from './client.js';

const BACKOFF_MIN_MS = 2000;
const BACKOFF_MAX_MS = 30000;
const MIN_POLL_GAP_MS = 1000;

/**
 * Mirrors the state of one profile. Emits via callbacks:
 *   onState(state|null), onStatus('online'|'offline'|'auth', message)
 */
export class Controller {
    constructor(onState, onStatus) {
        this._onState = onState;
        this._onStatus = onStatus;
        this._client = null;
        this._gen = 0;
        this._timer = 0;
        this.state = null;
    }

    get client() { return this._client; }

    /** Switch to a profile (or null to stop). secret comes from the keyring. */
    setProfile(profile, secret = '') {
        this._stop();
        this.state = null;
        this._onState(null);
        if (!profile)
            return;
        this._client = new Client(profile, secret);
        this._loop(++this._gen);
    }

    destroy() {
        this._stop();
        this._onState = () => {};
        this._onStatus = () => {};
    }

    elapsed() {
        return this.state ? elapsedAt(this.state, GLib.get_monotonic_time() / 1000) : 0;
    }

    /** Fire a command, then refresh the snapshot. Errors surface via status. */
    async command(name) { await this._act(c => c.command(name)); }
    async setVolume(v) { await this._act(c => c.setVolume(v)); }
    async toggleOutput(id) { await this._act(c => c.toggleOutput(id)); }
    async toggleSnapcast(id, muted) { await this._act(c => c.toggleSnapcast(id, muted)); }

    async _act(fn) {
        const client = this._client;
        if (!client)
            return;
        try {
            await fn(client);
            if (client === this._client)
                this._apply(await client.currentSong());
        } catch (e) {
            if (client === this._client)
                this._fail(e);
        }
    }

    _apply(s) {
        this.state = s;
        this._onStatus('online', '');
        this._onState(s);
    }

    _fail(e) {
        if (e instanceof AuthError)
            this._onStatus('auth', e.message);
        else
            this._onStatus('offline', e.message);
    }

    async _loop(gen) {
        const client = this._client;
        let delay = BACKOFF_MIN_MS;
        let first = true;
        while (gen === this._gen) {
            try {
                const t0 = GLib.get_monotonic_time() / 1000;
                const s = first ? await client.currentSong() : await client.pollCurrentSong();
                if (gen !== this._gen)
                    return;
                first = false;
                delay = BACKOFF_MIN_MS;
                this._apply(s);
                // A long poll should block; if it answers at once, don't spin.
                const spent = GLib.get_monotonic_time() / 1000 - t0;
                if (spent < MIN_POLL_GAP_MS)
                    await this._sleep(MIN_POLL_GAP_MS - spent, gen);
            } catch (e) {
                if (gen !== this._gen)
                    return;
                this._fail(e);
                await this._sleep(delay, gen);
                delay = Math.min(delay * 2, BACKOFF_MAX_MS);
                first = true;
            }
        }
    }

    _sleep(ms, gen) {
        return new Promise(resolve => {
            this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                this._timer = 0;
                resolve();
                return GLib.SOURCE_REMOVE;
            });
            this._wake = resolve;
        });
    }

    _stop() {
        this._gen++;
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        this._wake?.();
        this._wake = null;
        this._client?.destroy();
        this._client = null;
    }
}
