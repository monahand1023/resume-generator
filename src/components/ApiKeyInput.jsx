import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { isKeyValid } from '../config/providers';

/**
 * A single provider's API-key field: label with validity badge, a "how to get a
 * key" link, and a show/hide password input. Replaces three near-identical
 * hand-written blocks in App.js.
 */
function ApiKeyInput({ provider, value, onChange, show, onToggleShow }) {
    const trimmed = (value || '').trim();
    const valid = isKeyValid(provider, value);

    return (
        <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                {provider.label} API Key
                {valid && <span className="ml-2 text-green-600 text-xs">✓ Valid</span>}
                {trimmed && !valid && <span className="ml-2 text-red-600 text-xs">✗ Invalid format</span>}
            </label>
            {provider.keyDocUrl && (
                <a
                    href={provider.keyDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 underline mb-2 block"
                >
                    {provider.keyDocLabel}
                </a>
            )}
            <div className="relative">
                <input
                    type={show ? 'text' : 'password'}
                    value={value || ''}
                    onChange={(e) => onChange(provider.id, e.target.value)}
                    placeholder={provider.keyPlaceholder || ''}
                    aria-label={`${provider.label} API Key`}
                    className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        trimmed && !valid
                            ? 'border-red-300 bg-red-50'
                            : valid
                                ? 'border-green-300 bg-green-50'
                                : 'border-gray-300'
                    }`}
                />
                <button
                    type="button"
                    onClick={() => onToggleShow(provider.id)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={show ? 'Hide key' : 'Show key'}
                >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

export default ApiKeyInput;
