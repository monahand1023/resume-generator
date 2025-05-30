import React, { useState, useEffect } from 'react';
import { Upload, Link, Key, FileText, Mail, Loader2, Download, Settings, Eye, EyeOff } from 'lucide-react';

function App() {
    const [openaiKey, setOpenaiKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [jobUrl, setJobUrl] = useState('');
    const [resume, setResume] = useState(null);
    const [loading, setLoading] = useState({ openai: false, gemini: false });
    const [results, setResults] = useState({ openai: null, gemini: null });
    const [error, setError] = useState('');
    const [showApiKeys, setShowApiKeys] = useState(false);
    const [showKeys, setShowKeys] = useState({ openai: false, gemini: false });

    // Load API keys from localStorage on component mount
    useEffect(() => {
        const savedOpenaiKey = localStorage.getItem('openai_api_key');
        const savedGeminiKey = localStorage.getItem('gemini_api_key');
        if (savedOpenaiKey) setOpenaiKey(savedOpenaiKey);
        if (savedGeminiKey) setGeminiKey(savedGeminiKey);
    }, []);

    // Save API keys to localStorage whenever they change
    useEffect(() => {
        if (openaiKey) {
            localStorage.setItem('openai_api_key', openaiKey);
        } else {
            localStorage.removeItem('openai_api_key');
        }
    }, [openaiKey]);

    useEffect(() => {
        if (geminiKey) {
            localStorage.setItem('gemini_api_key', geminiKey);
        } else {
            localStorage.removeItem('gemini_api_key');
        }
    }, [geminiKey]);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file && (file.type === 'application/pdf' || file.type.includes('document'))) {
            setResume(file);
            setError('');
        } else {
            setError('Please upload a PDF or Word document');
        }
    };

    const handleSubmit = async (provider) => {
        const apiKey = provider === 'openai' ? openaiKey : geminiKey;

        if (!apiKey || !jobUrl || !resume) {
            setError('Please fill in all required fields');
            return;
        }

        setLoading(prev => ({ ...prev, [provider]: true }));
        setError('');

        try {
            const formData = new FormData();
            formData.append('resume', resume);
            formData.append('jobUrl', jobUrl);
            formData.append('apiKey', apiKey);
            formData.append('provider', provider);

            const response = await fetch('/api/customize-resume', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Failed to process request');
            }

            const data = await response.json();
            setResults(prev => ({ ...prev, [provider]: data }));
        } catch (err) {
            setError(err.message || 'Something went wrong');
        } finally {
            setLoading(prev => ({ ...prev, [provider]: false }));
        }
    };

    const downloadFile = (content, filename, format = 'txt') => {
        if (format === 'pdf' || format === 'docx') {
            // For PDF/Word downloads, we'll need to call a backend endpoint
            downloadFormattedFile(content, filename, format);
            return;
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadFormattedFile = async (content, filename, format) => {
        try {
            const response = await fetch('/api/format-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, format, filename })
            });

            if (!response.ok) throw new Error('Failed to format document');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(`Failed to download ${format.toUpperCase()}: ${err.message}`);
        }
    };

    const hasOpenaiKey = Boolean(openaiKey?.trim());
    const hasGeminiKey = Boolean(geminiKey?.trim());
    const canSubmit = Boolean(jobUrl?.trim() && resume);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Resume Customizer</h1>
                    <p className="text-gray-600">Upload your resume and job URL to get AI-customized resumes and cover letters</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                    <div className="space-y-6">
                        {/* API Keys Section */}
                        <div className="border-b pb-6">
                            <button
                                onClick={() => setShowApiKeys(!showApiKeys)}
                                className="flex items-center text-lg font-semibold text-gray-900 mb-4 hover:text-blue-600 transition-colors"
                            >
                                <Settings className="w-5 h-5 mr-2" />
                                API Configuration
                                <span className="ml-auto text-sm">
                                    {showApiKeys ? '▲' : '▼'}
                                </span>
                            </button>

                            {showApiKeys && (
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                                            <Key className="w-4 h-4 mr-2" />
                                            OpenAI API Key
                                            {hasOpenaiKey && <span className="ml-2 text-green-600 text-xs">✓ Saved</span>}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys.openai ? "text" : "password"}
                                                value={openaiKey}
                                                onChange={(e) => setOpenaiKey(e.target.value)}
                                                placeholder="sk-..."
                                                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKeys(prev => ({ ...prev, openai: !prev.openai }))}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showKeys.openai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                                            <Key className="w-4 h-4 mr-2" />
                                            Gemini API Key
                                            {hasGeminiKey && <span className="ml-2 text-green-600 text-xs">✓ Saved</span>}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys.gemini ? "text" : "password"}
                                                value={geminiKey}
                                                onChange={(e) => setGeminiKey(e.target.value)}
                                                placeholder="AI..."
                                                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Job URL */}
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

                        {/* Resume Upload */}
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

                        {/* Action Buttons */}
                        <div className="grid md:grid-cols-2 gap-4">
                            <button
                                onClick={() => handleSubmit('openai')}
                                disabled={!hasOpenaiKey || !canSubmit || loading.openai}
                                className={`w-full font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center ${
                                    hasOpenaiKey && canSubmit
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                {loading.openai ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        Processing with OpenAI...
                                    </>
                                ) : (
                                    <>Generate with OpenAI</>
                                )}
                            </button>

                            <button
                                onClick={() => handleSubmit('gemini')}
                                disabled={!hasGeminiKey || !canSubmit || loading.gemini}
                                className={`w-full font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center ${
                                    hasGeminiKey && canSubmit
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                {loading.gemini ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        Processing with Gemini...
                                    </>
                                ) : (
                                    <>Generate with Gemini</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Results Section */}
                {(results.openai || results.gemini) && (
                    <div className="space-y-8">
                        {results.openai && (
                            <ResultsSection
                                title="OpenAI Results"
                                results={results.openai}
                                downloadFile={downloadFile}
                                color="green"
                            />
                        )}
                        {results.gemini && (
                            <ResultsSection
                                title="Gemini Results"
                                results={results.gemini}
                                downloadFile={downloadFile}
                                color="blue"
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function ResultsSection({ title, results, downloadFile, color }) {
    const colorClasses = {
        green: {
            header: 'bg-green-50 border-green-200',
            title: 'text-green-800',
            button: 'bg-green-600 hover:bg-green-700'
        },
        blue: {
            header: 'bg-blue-50 border-blue-200',
            title: 'text-blue-800',
            button: 'bg-blue-600 hover:bg-blue-700'
        }
    };

    const classes = colorClasses[color];

    return (
        <div className={`border rounded-xl shadow-lg ${classes.header}`}>
            <div className={`p-4 border-b ${classes.header}`}>
                <h2 className={`text-xl font-bold ${classes.title}`}>{title}</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6 p-6 bg-white">
                <DocumentCard
                    title="Customized Resume"
                    icon={<FileText className="w-5 h-5 mr-2" />}
                    content={results.resume}
                    filename="customized-resume"
                    downloadFile={downloadFile}
                    buttonClass={classes.button}
                />

                <DocumentCard
                    title="Cover Letter"
                    icon={<Mail className="w-5 h-5 mr-2" />}
                    content={results.coverLetter}
                    filename="cover-letter"
                    downloadFile={downloadFile}
                    buttonClass={classes.button}
                />
            </div>
        </div>
    );
}

function DocumentCard({ title, icon, content, filename, downloadFile, buttonClass }) {
    return (
        <div className="bg-white rounded-xl shadow-lg border">
            <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    {icon}
                    {title}
                </h3>
            </div>

            <div className="p-4">
                <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto mb-4">
                    <pre className="whitespace-pre-wrap text-sm text-gray-700">
                        {content}
                    </pre>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => downloadFile(content, `${filename}.txt`)}
                        className={`flex-1 ${buttonClass} text-white px-3 py-2 rounded text-sm font-medium transition-colors`}
                    >
                        <Download className="w-4 h-4 mr-1 inline" />
                        TXT
                    </button>
                    <button
                        onClick={() => downloadFile(content, filename, 'pdf')}
                        className={`flex-1 ${buttonClass} text-white px-3 py-2 rounded text-sm font-medium transition-colors`}
                    >
                        <Download className="w-4 h-4 mr-1 inline" />
                        PDF
                    </button>
                    <button
                        onClick={() => downloadFile(content, filename, 'docx')}
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

export default App;