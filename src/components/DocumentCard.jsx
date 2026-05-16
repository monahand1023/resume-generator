import React from 'react';
import { Download } from 'lucide-react';

function DocumentCard({ title, icon, content, filename, downloadFile, buttonClass, metadata }) {
    return (
        <div className="bg-white rounded-xl shadow-lg border">
            <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    {icon}
                    {title}
                </h3>
            </div>

            <div className="p-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => downloadFile(content, filename, 'txt', metadata)}
                        className={`flex-1 ${buttonClass} text-white px-3 py-2 rounded text-sm font-medium transition-colors`}
                    >
                        <Download className="w-4 h-4 mr-1 inline" />
                        TXT
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
