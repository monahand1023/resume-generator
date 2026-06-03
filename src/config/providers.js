// Single source of truth for the AI providers the UI knows about.
//
// Server availability (e.g. Bedrock only when AWS is configured) is layered on
// top at runtime via GET /api/providers — see App.js. `usesServerCredentials`
// providers have no user-entered key and so render no key input.
//
// Full literal Tailwind class strings are kept here (not built dynamically) so
// they survive any future move from the Tailwind CDN to a compiled/purged build.

export const PROVIDERS = [
    {
        id: 'openai',
        label: 'OpenAI',
        color: 'green',
        usesServerCredentials: false,
        keyPlaceholder: 'sk-...',
        keyPrefix: 'sk-',
        keyDocUrl: 'https://platform.openai.com/api-keys',
        keyDocLabel: 'How To Get an OpenAI API Key',
        classes: { button: 'bg-green-600 hover:bg-green-700', progress: 'bg-green-500' },
    },
    {
        id: 'gemini',
        label: 'Gemini',
        color: 'blue',
        usesServerCredentials: false,
        keyPlaceholder: 'AIza...',
        keyPrefix: 'AIza',
        keyDocUrl: 'https://ai.google.dev/gemini-api/docs/api-key',
        keyDocLabel: 'How To Get a Gemini API Key',
        classes: { button: 'bg-blue-600 hover:bg-blue-700', progress: 'bg-blue-500' },
    },
    {
        id: 'claude',
        label: 'Claude',
        color: 'purple',
        usesServerCredentials: false,
        keyPlaceholder: 'sk-ant-...',
        keyPrefix: 'sk-ant-',
        keyDocUrl: 'https://console.anthropic.com/settings/keys',
        keyDocLabel: 'How To Get a Claude API Key',
        classes: { button: 'bg-purple-600 hover:bg-purple-700', progress: 'bg-purple-500' },
    },
    {
        id: 'bedrock',
        label: 'Bedrock',
        color: 'amber',
        usesServerCredentials: true,
        keyPlaceholder: null,
        keyPrefix: null,
        keyDocUrl: null,
        keyDocLabel: null,
        classes: { button: 'bg-amber-600 hover:bg-amber-700', progress: 'bg-amber-500' },
    },
];

export const PROVIDERS_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Providers that require a user-entered API key. */
export const userKeyProviders = () => PROVIDERS.filter((p) => !p.usesServerCredentials);

/**
 * True when `key` is a plausibly-valid key for this provider (prefix match).
 * Server-credential providers are always considered ready.
 */
export function isKeyValid(provider, key) {
    if (provider.usesServerCredentials) return true;
    const trimmed = (key || '').trim();
    if (!trimmed) return false;
    return provider.keyPrefix ? trimmed.startsWith(provider.keyPrefix) : true;
}
