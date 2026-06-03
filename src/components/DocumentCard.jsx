import React, { useState } from 'react';
import { Download, Copy, Check } from 'lucide-react';

function DocumentCard({ title, icon, content, filename, downloadFile, buttonClass, metadata }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!content) return;
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            // Fallback for older browsers / insecure contexts
            try {
                const ta = document.createElement('textarea');
                ta.value = content;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (_) {
                // silently fail if clipboard is inaccessible
            }
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border">
            <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    {icon}
                    {title}
                </h3>
                <button
                    onClick={handleCopy}
                    disabled={!content}
                    title="Copy to clipboard"
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {copied ? (
                        <>
                            <Check className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-green-600">Copied!</span>
                        </>
                    ) : (
                        <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                        </>
                    )}
                </button>
            </div>

            <div className="p-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => downloadFile(content, filename, 'txt', metadata)}
                        title="Clean ATS-friendly plain text"
                        className={`flex-1 ${buttonClass} text-white px-3 py-2 rounded text-sm font-medium transition-colors`}
                    >
                        <Download className="w-4 h-4 mr-1 inline" />
                        TXT
                    </button>
                    <button
                        onClick={() => downloadFile(content, filename, 'md', metadata)}
                        title="Markdown"
                        className={`flex-1 ${buttonClass} text-white px-3 py-2 rounded text-sm font-medium transition-colors`}
                    >
                        <Download className="w-4 h-4 mr-1 inline" />
                        MD
                    </button>
                    <button
                        onClick={() => downloadFile(content, filename, 'pdf', metadata)}
                        className={`flex-1 ${buttonClass} text-white px-3 py-2 rounded text-sm font-medium transition-colors`}
                    >
                        <Download className="w-4 h-4 mr-1 inline" />
                        PDF
                    </button>
                    <button
                        onClick={() => downloadFile(content, filename, 'docx', metadata)}
                        className={`flex-1 ${buttonClass} text-white px-3 py-2 rounded text-sm font-medium transition-colors`}
                    >
                        <Download className="w-4 h-4 mr-1 inline" />
                        DOCX
                    </button>
                </div>
            </div>
        </div>
    );
}

export default DocumentCard;
