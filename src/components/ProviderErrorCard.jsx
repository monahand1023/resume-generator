import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Red "<provider> failed" card with a retry button. Replaces six copies of the
 * same markup in App.js (three providers × two render locations).
 */
function ProviderErrorCard({ provider, message, onRetry, disabled }) {
    return (
        <div className="border-l-4 border-red-300 pl-6">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-800 mb-1">{provider.label} failed</p>
                    <p className="text-sm text-red-700">{message}</p>
                </div>
                <button
                    onClick={() => onRetry(provider.id)}
                    disabled={disabled}
                    className="flex items-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                </button>
            </div>
        </div>
    );
}

export default ProviderErrorCard;
