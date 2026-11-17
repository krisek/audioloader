import GLib from 'gi://GLib';

/** Profile shape: {id, name, baseUrl, mpdServer, clientId, authMode, username}. Secrets live in the keyring. */
export const AUTH_MODES = ['none', 'basic', 'bearer', 'cookie'];

export function newProfile() {
    return {
        id: GLib.uuid_string_random(),
        name: 'New profile',
        baseUrl: 'http://localhost:8080',
        mpdServer: 'localhost:6600',
        clientId: 'gnome',
        authMode: 'none',
        username: '',
    };
}

export function loadProfiles(settings) {
    try {
        const v = JSON.parse(settings.get_string('profiles'));
        return Array.isArray(v) ? v : [];
    } catch (_e) {
        return [];
    }
}

export function saveProfiles(settings, list) {
    settings.set_string('profiles', JSON.stringify(list));
}

export function activeProfile(settings) {
    const list = loadProfiles(settings);
    const id = settings.get_string('active-profile');
    return list.find(p => p.id === id) ?? list[0] ?? null;
}

/** Plain http with credentials is refused except for localhost. */
export function validateProfile(p) {
    let uri;
    try {
        uri = GLib.Uri.parse(p.baseUrl, GLib.UriFlags.NONE);
    } catch (_e) {
        return 'Invalid base URL';
    }
    const scheme = uri.get_scheme();
    if (scheme !== 'http' && scheme !== 'https')
        return 'URL must start with http:// or https://';
    const host = uri.get_host();
    const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (scheme === 'http' && p.authMode !== 'none' && !local)
        return 'Credentials over plain http are only allowed for localhost';
    return null;
}
