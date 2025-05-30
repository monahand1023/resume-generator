import React, { useState } from 'react';
import { Upload, Link, Key, FileText, Mail, Loader2 } from 'lucide-react';

function App() {
    const [apiKey, setApiKey] = useState('');
    const [jobUrl, setJobUrl] = useState('');
    const [resume, setResume] = useState(null);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState('');

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file && (file.type === 'application/pdf' || file.type.includes('document'))) {
            setResume(file);
            setError('');
        } else {
            setError('Please upload a PDF or Word document');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!apiKey || !jobUrl || !resume) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('resume', resume);
            formData.append('jobUrl', jobUrl);
            formData.append('apiKey', apiKey);

            const response = await fetch('/api/customize-resume', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Failed to process request');
            }

            const data = await response.json();
            setResults(data);
        } catch (err) {
            setError(err.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const downloadFile = (content, filename) => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Resume Customizer</h1>
                    <p className="text-gray-600">Upload your resume and job URL to get a customized resume and cover letter</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                    <div className="space-y-6">
                        <div>
                            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                                <Key className="w-4 h-4 mr-2" />
                                OpenAI API Key
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                                <Link className="w-4 h-4 mr-2" />
                                Job Posting URL
                            </label>
                            <input
                                type="url"
                                value={jobUrl}
                                onChange={(e) => setJobUrl(e.target.value)}
                                placeholder="https://company.com/jobs/position"
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                                <Upload className="w-4 h-4 mr-2" />
                                Resume (PDF or Word)
                            </label>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                                <input
                                    type="file"
                                    onChange={handleFileUpload}
                                    accept=".pdf,.doc,.docx"
                                    className="hidden"
                                    id="resume-upload"
                                />
                                <label htmlFor="resume-upload" className="cursor-pointer">
                                    {resume ? (
                                        <div className="text-green-600">
                                            <FileText className="w-8 h-8 mx-auto mb-2" />
                                            <p>{resume.name}</p>
                                        </div>
                                    ) : (
                                        <div className="text-gray-500">
                                            <Upload className="w-8 h-8 mx-auto mb-2" />
                                            <p>Click to upload your resume</p>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                'Customize Resume'
                            )}
                        </button>
                    </div>
                </div>

                {results && (
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                                    <FileText className="w-5 h-5 mr-2" />
                                    Customized Resume
                                </h3>
                                <button
                                    onClick={() => downloadFile(results.resume, 'customized-resume.txt')}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                                >
                                    Download
                                </button>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {results.resume}
                </pre>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                                    <Mail className="w-5 h-5 mr-2" />
                                    Cover Letter
                                </h3>
                                <button
                                    onClick={() => downloadFile(results.coverLetter, 'cover-letter.txt')}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                                >
                                    Download
                                </button>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {results.coverLetter}
                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;