import React from 'react';
import { TrendingUp, Info } from 'lucide-react';

const COLOR_CLASSES = {
    green: {
        header: 'bg-green-50 border-green-200',
        title: 'text-green-800',
    },
    blue: {
        header: 'bg-blue-50 border-blue-200',
        title: 'text-blue-800',
    },
    purple: {
        header: 'bg-purple-50 border-purple-200',
        title: 'text-purple-800',
    },
    amber: {
        header: 'bg-amber-50 border-amber-200',
        title: 'text-amber-800',
    },
};

function ChangesSection({ title, results, parseChangesData, color }) {
    const classes = COLOR_CLASSES[color];
    const changesData = parseChangesData(results.changes);

    return (
        <div className={`border rounded-xl shadow-lg ${classes.header}`}>
            <div className={`p-4 border-b ${classes.header}`}>
                <h2 className={`text-xl font-bold ${classes.title}`}>{title}</h2>
                {results.metadata && (
                    <p className="text-sm text-gray-600 mt-1">
                        {results.metadata.name} • {results.metadata.company} • {results.metadata.position}
                    </p>
                )}
            </div>

            {changesData && (
                <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-b border-gray-200">
                    <h3 className="flex items-center text-lg font-semibold text-gray-800 mb-4">
                        <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                        Resume Optimization Summary
                    </h3>

                    {changesData.metrics && (
                        <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                            <div className="flex items-center text-sm font-medium text-gray-600 mb-2">
                                <Info className="w-4 h-4 mr-2" />
                                Impact Overview
                            </div>
                            <p className="text-gray-800 font-medium">{changesData.metrics}</p>
                        </div>
                    )}

                    {changesData.keyChanges && changesData.keyChanges.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-gray-600 mb-3">Key Improvements</h4>
                            {changesData.keyChanges.map((change, index) => (
                                <div key={index} className="bg-white rounded-lg p-4 shadow-sm">
                                    <h5 className="font-medium text-gray-800 mb-3">{change.title}</h5>
                                    <div className="space-y-2">
                                        <div className="flex items-start">
                                            <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded mr-3 mt-0.5">
                                                BEFORE
                                            </span>
                                            <p className="text-sm text-gray-600 flex-1">{change.before}</p>
                                        </div>
                                        <div className="flex items-start">
                                            <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded mr-3 mt-0.5">
                                                AFTER
                                            </span>
                                            <p className="text-sm text-gray-800 flex-1 bg-green-50 p-2 rounded">
                                                {change.after}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!changesData.metrics && !changesData.keyChanges.length && results.changes && (
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="flex items-center text-sm font-medium text-gray-600 mb-2">
                                <Info className="w-4 h-4 mr-2" />
                                Changes Made
                            </div>
                            <div className="text-sm text-gray-700">
                                <pre className="whitespace-pre-wrap font-sans">{results.changes}</pre>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default ChangesSection;
