import React from 'react';
import { Eye, X } from 'lucide-react';

/**
 * Shows exactly what the AI will receive: the scraped job description, the parsed
 * resume text, and the company/position/name detected from them. Helps users
 * spot a bad scrape (e.g. the "couldn't find company/title" case) before
 * spending tokens on a run.
 */
function InputPreview({ data, onClose }) {
    if (!data) return null;
    const { metadata = {}, resumeText = '', jobDescription = '' } = data;

    return (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center text-lg font-semibold text-gray-900">
                    <Eye className="w-5 h-5 mr-2" />
                    What the AI will see
                </h2>
                <button
                    onClick={onClose}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
                    aria-label="Hide preview"
                >
                    <X className="w-4 h-4" />
                    Hide
                </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
                Detected — Name: <span className="font-medium text-gray-900">{metadata.name}</span> · Company:{' '}
                <span className="font-medium text-gray-900">{metadata.company}</span> · Position:{' '}
                <span className="font-medium text-gray-900">{metadata.position}</span>
            </p>

            <div className="grid md:grid-cols-2 gap-4">
                <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Parsed résumé text</h3>
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap">
                        {resumeText || '(empty)'}
                    </pre>
                </div>
                <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Scraped job description</h3>
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-72 overflow-auto whitespace-pre-wrap">
                        {jobDescription || '(empty)'}
                    </pre>
                </div>
            </div>
        </div>
    );
}

export default InputPreview;
