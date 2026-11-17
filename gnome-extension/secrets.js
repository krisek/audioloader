import Secret from 'gi://Secret';

const SCHEMA = new Secret.Schema(
    'org.gnome.shell.extensions.audioloader',
    Secret.SchemaFlags.NONE,
    {profile: Secret.SchemaAttributeType.STRING});

export function lookupSecret(profileId) {
    return new Promise((resolve, reject) => {
        Secret.password_lookup(SCHEMA, {profile: profileId}, null, (_s, res) => {
            try {
                resolve(Secret.password_lookup_finish(res) ?? '');
            } catch (e) {
                reject(e);
            }
        });
    });
}

export function storeSecret(profileId, name, secret) {
    return new Promise((resolve, reject) => {
        Secret.password_store(SCHEMA, {profile: profileId}, Secret.COLLECTION_DEFAULT,
            `Audioloader: ${name}`, secret, null, (_s, res) => {
                try {
                    Secret.password_store_finish(res);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
    });
}

export function clearSecret(profileId) {
    return new Promise((resolve, reject) => {
        Secret.password_clear(SCHEMA, {profile: profileId}, null, (_s, res) => {
            try {
                Secret.password_clear_finish(res);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
}
