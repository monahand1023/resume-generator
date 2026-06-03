import React from 'react';
import { FileText, Mail } from 'lucide-react';
import DocumentCard from './DocumentCard';

const COLOR_CLASSES = {
    green: {
        border: 'border-green-200',
        title: 'text-green-800',
        button: 'bg-green-600 hover:bg-green-700',
    },
    blue: {
        border: 'border-blue-200',
        title: 'text-blue-800',
        button: 'bg-blue-600 hover:bg-blue-700',
    },
    purple: {
        border: 'border-purple-200',
        title: 'text-purple-800',
        button: 'bg-purple-600 hover:bg-purple-700',
    },
    amber: {
        border: 'border-amber-200',
        title: 'text-amber-800',
        button: 'bg-amber-600 hover:bg-amber-700',
    },
};

function DownloadSection({ title, results, downloadFile, color }) {
    const classes = COLOR_CLASSES[color];

    return (
        <div className={`border-l-4 ${classes.border} pl-6`}>
            <h3 className={`text-lg font-semibold ${classes.title} mb-3`}>{title}</h3>
            {results.metadata && (
                <p className="text-sm text-gray-600 mb-4">
                    {results.metadata.name} • {results.metadata.company} • {results.metadata.position}
                </p>
            )}
            <div className="grid md:grid-cols-2 gap-4">
                <DocumentCard
                    title="Customized Resume"
                    icon={<FileText className="w-5 h-5 mr-2" />}
                    content={results.resume}
                    filename="resume"
                    downloadFile={downloadFile}
                    buttonClass={classes.button}
                    metadata={results.metadata}
                />
                <DocumentCard
                    title="Cover Letter"
                    icon={<Mail className="w-5 h-5 mr-2" />}
                    content={results.coverLetter}
                    filename="cover_letter"
                    downloadFile={downloadFile}
                    buttonClass={classes.button}
                    metadata={results.metadata}
                />
            </div>
        </div>
    );
}

export default DownloadSection;
