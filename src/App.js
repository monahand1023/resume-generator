import React, { useState, useEffect } from 'react';
import { Upload, Link, Key, FileText, Mail, Loader2, Download, Eye, EyeOff, Info, TrendingUp } from 'lucide-react';

function App() {
    const [openaiKey, setOpenaiKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [claudeKey, setClaudeKey] = useState('');
    const [jobUrl, setJobUrl] = useState('');
    const [resume, setResume] = useState(null);
    const [loading, setLoading] = useState({ openai: false, gemini: false, claude: false });
    const [results, setResults] = useState({ openai: null, gemini: null, claude: null });
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [showKeys, setShowKeys] = useState({ openai: false, gemini: false, claude: false });

    // Load API keys from localStorage on component mount
    useEffect(() => {
        const savedOpenaiKey = localStorage.getItem('openai_api_key');
        const savedGeminiKey = localStorage.getItem('gemini_api_key');
        const savedClaudeKey = localStorage.getItem('claude_api_key');
        if (savedOpenaiKey) setOpenaiKey(savedOpenaiKey);
        if (savedGeminiKey) setGeminiKey(savedGeminiKey);
        if (savedClaudeKey) setClaudeKey(savedClaudeKey);
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

    useEffect(() => {
        if (claudeKey) {
            localStorage.setItem('claude_api_key', claudeKey);
        } else {
            localStorage.removeItem('claude_api_key');
        }
    }, [claudeKey]);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type === 'application/pdf' || file.type.includes('document')) {
                setResume(file);
                setError('');
            } else {
                setError('Please upload a PDF or Word document');
            }
        }
    };

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
        const apiKeys = { openai: openaiKey, gemini: geminiKey, claude: claudeKey };
        const apiKey = apiKeys[provider];

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

            const response = await fetch('http://localhost:3000/api/customize-resume', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                // Try to get the error message from the server response
                let serverError = 'Failed to process request';
                try {
                    const errorData = await response.json();
                    serverError = errorData.error || serverError;
                } catch (parseError) {
                    // If we can't parse the error response, use the status text
                    serverError = response.statusText || serverError;
                }
                throw new Error(serverError);
            }

            const data = await response.json();
            setResults(prev => ({ ...prev, [provider]: data }));
        } catch (err) {
            let errorMessage = err.message || 'Something went wrong';

            // Handle connection errors (server not running)
            if (err.message && err.message.includes('fetch')) {
                errorMessage = "The backend server isn't running. Did you forget to start it? Run 'node server.js' in the backend directory.";
            }
            // Handle specific API errors based on the actual error message
            else {
                const lowerError = errorMessage.toLowerCase();

                if (lowerError.includes('quota') || lowerError.includes('429')) {
                    errorMessage = `${provider} API quota exceeded. Please check your billing or try again later.`;
                } else if (lowerError.includes('unauthorized') || lowerError.includes('401')) {
                    errorMessage = `Invalid ${provider} API key. Please check your key and try again.`;
                } else if (lowerError.includes('403') || lowerError.includes('forbidden')) {
                    errorMessage = `${provider} API access denied. Check your permissions.`;
                } else if (lowerError.includes('api error')) {
                    // Keep the original server error message for API errors
                    errorMessage = `${provider}: ${errorMessage}`;
                }
            }

            setError(errorMessage);
        } finally {
            setLoading(prev => ({ ...prev, [provider]: false }));
        }
    };

    const generateFilename = (baseType, metadata, format) => {
        if (!metadata) return `${baseType}.${format}`;

        const { name, company, position } = metadata;
        const cleanName = (name || 'Resume').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const cleanCompany = (company || 'Company').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const cleanPosition = (position || 'Position').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');

        if (baseType === 'resume') {
            return `${cleanName}_Resume_${cleanCompany}_${cleanPosition}.${format}`;
        } else {
            return `${cleanName}_CoverLetter_${cleanCompany}_${cleanPosition}.${format}`;
        }
    };

    const downloadFile = (content, baseFilename, format = 'txt', metadata = null) => {
        if (format === 'pdf' || format === 'docx') {
            downloadFormattedFile(content, baseFilename, format, metadata);
            return;
        }

        const filename = generateFilename(baseFilename, metadata, format);
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadFormattedFile = async (content, baseFilename, format, metadata) => {
        try {
            const filename = generateFilename(baseFilename, metadata, format);

            const response = await fetch('http://localhost:3000/api/format-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    format,
                    filename: filename.replace(`.${format}`, ''),
                    metadata
                })
            });

            if (!response.ok) throw new Error('Failed to format document');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(`Failed to download ${format.toUpperCase()}: ${err.message}`);
        }
    };

    // Helper function to clean markdown formatting
    const cleanMarkdown = (text) => {
        if (!text) return text;
        return text
            .replace(/\*\*/g, '')  // Remove **bold**
            .replace(/\*/g, '')    // Remove *italic*
            .replace(/_{2,}/g, '') // Remove multiple underscores
            .replace(/^_+|_+$/gm, '') // Remove leading/trailing underscores
            .replace(/^#+\s*/gm, '') // Remove # headers
            .replace(/`{1,3}/g, '') // Remove code backticks
            .trim();
    };

    // Helper function to parse structured changes data
    const parseChangesData = (changesText) => {
        if (!changesText) return null;

        const lines = changesText.split('\n').filter(line => line.trim());
        let metrics = '';
        const keyChanges = [];
        let currentChange = null;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.includes('METRICS:')) {
                metrics = cleanMarkdown(trimmed.replace('METRICS:', '').trim());
            } else if (trimmed.includes('CHANGE:')) {
                if (currentChange) {
                    keyChanges.push(currentChange);
                }
                currentChange = {
                    title: cleanMarkdown(trimmed.replace('CHANGE:', '').trim()),
                    before: '',
                    after: ''
                };
            } else if (trimmed.includes('BEFORE:')) {
                if (currentChange) {
                    currentChange.before = cleanMarkdown(trimmed.replace('BEFORE:', '').trim());
                }
            } else if (trimmed.includes('AFTER:')) {
                if (currentChange) {
                    currentChange.after = cleanMarkdown(trimmed.replace('AFTER:', '').trim());
                }
            }
        }

        if (currentChange) {
            keyChanges.push(currentChange);
        }

        return { metrics, keyChanges };
    };

    // Temporary simple validation for debugging
    const hasOpenaiKey = Boolean(openaiKey?.trim());
    const hasGeminiKey = Boolean(geminiKey?.trim());
    const hasClaudeKey = Boolean(claudeKey?.trim());
    const canSubmit = Boolean(jobUrl?.trim() && resume);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Dan's Resume Customizer</h1>
                    <p className="text-gray-600">Upload your resume and job URL to get AI-customized resumes and cover letters</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                    <div className="space-y-6">
                        {/* API Keys Section - Always Visible */}
                        <div className="border-b pb-6">
                            <h2 className="flex items-center text-lg font-semibold text-gray-900 mb-4">
                                <Key className="w-5 h-5 mr-2" />
                                API Configuration
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                                        OpenAI API Key
                                        {hasOpenaiKey && <span className="ml-2 text-green-600 text-xs">✓ Valid</span>}
                                        {openaiKey?.trim() && !hasOpenaiKey && <span className="ml-2 text-red-600 text-xs">✗ Invalid format</span>}
                                    </label>
                                    <a
                                        href="https://platform.openai.com/api-keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline mb-2 block"
                                    >
                                        How To Get an OpenAI API Key
                                    </a>
                                    <div className="relative">
                                        <input
                                            type={showKeys.openai ? "text" : "password"}
                                            value={openaiKey}
                                            onChange={(e) => setOpenaiKey(e.target.value)}
                                            placeholder="sk-..."
                                            className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                                openaiKey?.trim() && !hasOpenaiKey
                                                    ? 'border-red-300 bg-red-50'
                                                    : hasOpenaiKey
                                                        ? 'border-green-300 bg-green-50'
                                                        : 'border-gray-300'
                                            }`}
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
                                        Gemini API Key
                                        {hasGeminiKey && <span className="ml-2 text-green-600 text-xs">✓ Valid</span>}
                                        {geminiKey?.trim() && !hasGeminiKey && <span className="ml-2 text-red-600 text-xs">✗ Invalid format</span>}
                                    </label>
                                    <a
                                        href="https://ai.google.dev/gemini-api/docs/api-key"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline mb-2 block"
                                    >
                                        How To Get a Gemini API Key
                                    </a>
                                    <div className="relative">
                                        <input
                                            type={showKeys.gemini ? "text" : "password"}
                                            value={geminiKey}
                                            onChange={(e) => setGeminiKey(e.target.value)}
                                            placeholder="AI..."
                                            className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                                geminiKey?.trim() && !hasGeminiKey
                                                    ? 'border-red-300 bg-red-50'
                                                    : hasGeminiKey
                                                        ? 'border-green-300 bg-green-50'
                                                        : 'border-gray-300'
                                            }`}
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

                                <div>
                                    <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                                        Claude API Key
                                        {hasClaudeKey && <span className="ml-2 text-green-600 text-xs">✓ Valid</span>}
                                        {claudeKey?.trim() && !hasClaudeKey && <span className="ml-2 text-red-600 text-xs">✗ Invalid format</span>}
                                    </label>
                                    <a
                                        href="https://console.anthropic.com/settings/keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline mb-2 block"
                                    >
                                        How To Get a Claude API Key
                                    </a>
                                    <div className="relative">
                                        <input
                                            type={showKeys.claude ? "text" : "password"}
                                            value={claudeKey}
                                            onChange={(e) => setClaudeKey(e.target.value)}
                                            placeholder="sk-ant-..."
                                            className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                                claudeKey?.trim() && !hasClaudeKey
                                                    ? 'border-red-300 bg-red-50'
                                                    : hasClaudeKey
                                                        ? 'border-green-300 bg-green-50'
                                                        : 'border-gray-300'
                                            }`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKeys(prev => ({ ...prev, claude: !prev.claude }))}
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showKeys.claude ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
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
                            <div
                                className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 ${
                                    dragActive
                                        ? 'border-green-400 bg-green-50'
                                        : resume
                                            ? 'border-green-300 bg-green-50'
                                            : 'border-gray-300 hover:border-blue-400'
                                }`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
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
                                            <p className="font-medium">{resume.name}</p>
                                            <p className="text-sm text-green-500">✓ Ready to process</p>
                                        </div>
                                    ) : dragActive ? (
                                        <div className="text-green-600">
                                            <Upload className="w-8 h-8 mx-auto mb-2" />
                                            <p className="font-medium">Drop your resume here</p>
                                        </div>
                                    ) : (
                                        <div className="text-gray-500">
                                            <Upload className="w-8 h-8 mx-auto mb-2" />
                                            <p>Drag & drop your resume or click to upload</p>
                                            <p className="text-xs mt-1">PDF or Word documents only</p>
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
                        <div className="grid grid-cols-3 gap-4">
                            <button
                                onClick={() => handleSubmit('openai')}
                                disabled={!hasOpenaiKey || !canSubmit || loading.openai}
                                className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center ${
                                    hasOpenaiKey && canSubmit
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                                title={!hasOpenaiKey ? "Enter OpenAI API key" : !canSubmit ? "Add job URL and upload resume" : ""}
                            >
                                {loading.openai ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        OpenAI...
                                    </>
                                ) : (
                                    <>OpenAI</>
                                )}
                            </button>

                            <button
                                onClick={() => handleSubmit('gemini')}
                                disabled={!hasGeminiKey || !canSubmit || loading.gemini}
                                className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center ${
                                    hasGeminiKey && canSubmit
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                                title={!hasGeminiKey ? "Enter Gemini API key" : !canSubmit ? "Add job URL and upload resume" : ""}
                            >
                                {loading.gemini ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Gemini...
                                    </>
                                ) : (
                                    <>Gemini</>
                                )}
                            </button>

                            <button
                                onClick={() => handleSubmit('claude')}
                                disabled={!hasClaudeKey || !canSubmit || loading.claude}
                                className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center ${
                                    hasClaudeKey && canSubmit
                                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                                title={!hasClaudeKey ? "Enter Claude API key" : !canSubmit ? "Add job URL and upload resume" : ""}
                            >
                                {loading.claude ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Claude...
                                    </>
                                ) : (
                                    <>Claude</>
                                )}
                            </button>
                        </div>

                        {/* Status Message */}
                        {(!jobUrl?.trim() || !resume) && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
                                <div className="flex items-start">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm">
                                            To generate customized resumes, please:
                                            {!jobUrl?.trim() && !resume && " add a job URL and upload your resume"}
                                            {!jobUrl?.trim() && resume && " add a job URL"}
                                            {jobUrl?.trim() && !resume && " upload your resume"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Download Section - Now above changes */}
                {(results.openai || results.gemini || results.claude) && (
                    <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Download Your Documents</h2>
                        <div className="space-y-6">
                            {results.openai && (
                                <DownloadSection
                                    title="OpenAI Results"
                                    results={results.openai}
                                    downloadFile={downloadFile}
                                    color="green"
                                />
                            )}
                            {results.gemini && (
                                <DownloadSection
                                    title="Gemini Results"
                                    results={results.gemini}
                                    downloadFile={downloadFile}
                                    color="blue"
                                />
                            )}
                            {results.claude && (
                                <DownloadSection
                                    title="Claude Results"
                                    results={results.claude}
                                    downloadFile={downloadFile}
                                    color="purple"
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* Changes Analysis Section */}
                {(results.openai || results.gemini || results.claude) && (
                    <div className="space-y-8">
                        {results.openai && (
                            <ChangesSection
                                title="OpenAI Analysis"
                                results={results.openai}
                                parseChangesData={parseChangesData}
                                color="green"
                            />
                        )}
                        {results.gemini && (
                            <ChangesSection
                                title="Gemini Analysis"
                                results={results.gemini}
                                parseChangesData={parseChangesData}
                                color="blue"
                            />
                        )}
                        {results.claude && (
                            <ChangesSection
                                title="Claude Analysis"
                                results={results.claude}
                                parseChangesData={parseChangesData}
                                color="purple"
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function DownloadSection({ title, results, downloadFile, color }) {
    const colorClasses = {
        green: {
            border: 'border-green-200',
            title: 'text-green-800',
            button: 'bg-green-600 hover:bg-green-700'
        },
        blue: {
            border: 'border-blue-200',
            title: 'text-blue-800',
            button: 'bg-blue-600 hover:bg-blue-700'
        },
        purple: {
            border: 'border-purple-200',
            title: 'text-purple-800',
            button: 'bg-purple-600 hover:bg-purple-700'
        }
    };

    const classes = colorClasses[color];

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

function ChangesSection({ title, results, parseChangesData, color }) {
    const colorClasses = {
        green: {
            header: 'bg-green-50 border-green-200',
            title: 'text-green-800'
        },
        blue: {
            header: 'bg-blue-50 border-blue-200',
            title: 'text-blue-800'
        },
        purple: {
            header: 'bg-purple-50 border-purple-200',
            title: 'text-purple-800'
        }
    };

    const classes = colorClasses[color];
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

            {/* Enhanced Changes Summary */}
            {changesData && (
                <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-b border-gray-200">
                    <h3 className="flex items-center text-lg font-semibold text-gray-800 mb-4">
                        <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                        Resume Optimization Summary
                    </h3>

                    {/* High-level metrics */}
                    {changesData.metrics && (
                        <div className="bg-white rounded-lg p-4 mb-4 shadow-sm">
                            <div className="flex items-center text-sm font-medium text-gray-600 mb-2">
                                <Info className="w-4 h-4 mr-2" />
                                Impact Overview
                            </div>
                            <p className="text-gray-800 font-medium">{changesData.metrics}</p>
                        </div>
                    )}

                    {/* Key changes */}
                    {changesData.keyChanges && changesData.keyChanges.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium text-gray-600 mb-3">Key Improvements</h4>
                            {changesData.keyChanges.map((change, index) => (
                                <div key={index} className="bg-white rounded-lg p-4 shadow-sm">
                                    <h5 className="font-medium text-gray-800 mb-3">{change.title}</h5>
                                    <div className="space-y-2">
                                        <div className="flex items-start">
                                            <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded mr-3 mt-0.5">BEFORE</span>
                                            <p className="text-sm text-gray-600 flex-1">{change.before}</p>
                                        </div>
                                        <div className="flex items-start">
                                            <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded mr-3 mt-0.5">AFTER</span>
                                            <p className="text-sm text-gray-800 flex-1 bg-green-50 p-2 rounded">{change.after}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Fallback for unstructured changes */}
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

export default App;