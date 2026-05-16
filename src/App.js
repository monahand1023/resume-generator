import React, { useState, useEffect } from 'react';
import { Upload, Link, Key, FileText, Loader2, Eye, EyeOff, ChevronDown, ChevronUp, Clock, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import DownloadSection from './components/DownloadSection';
import ChangesSection from './components/ChangesSection';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

function App() {
    const [openaiKey, setOpenaiKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [claudeKey, setClaudeKey] = useState('');
    const [jobUrl, setJobUrl] = useState('');
    const [resume, setResume] = useState(null);
    const [loading, setLoading] = useState({ openai: false, gemini: false, claude: false });
    const [results, setResults] = useState({ openai: null, gemini: null, claude: null });
    const [providerErrors, setProviderErrors] = useState({ openai: null, gemini: null, claude: null });
    const [error, setError] = useState('');
    const [history, setHistory] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('resume_history') || '[]');
        } catch (_) {
            return [];
        }
    });
    const [showHistory, setShowHistory] = useState(false);
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

    // Persist results to history whenever a provider result arrives
    useEffect(() => {
        const hasResult = results.openai || results.gemini || results.claude;
        if (!hasResult) return;

        setHistory(prev => {
            const entry = {
                timestamp: new Date().toISOString(),
                jobUrl,
                results,
            };
            const updated = [entry, ...prev].slice(0, 10);
            try {
                localStorage.setItem('resume_history', JSON.stringify(updated));
            } catch (_) {
                // localStorage quota exceeded — skip silently
            }
            return updated;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [results]);

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

    // Track active EventSource connections so we can close them on unmount or re-submission
    const eventSources = React.useRef({});
    // Track per-provider progress (0-100)
    const [progress, setProgress] = useState({ openai: 0, gemini: 0, claude: 0 });

    // Close all EventSource connections on unmount
    useEffect(() => {
        return () => {
            Object.values(eventSources.current).forEach(es => es.close());
        };
    }, []);

    const handleSubmit = async (provider) => {
        const apiKeys = { openai: openaiKey, gemini: geminiKey, claude: claudeKey };
        const apiKey = apiKeys[provider];

        if (!apiKey || !jobUrl || !resume) {
            setError('Please fill in all required fields');
            return;
        }

        // Close any existing SSE connection for this provider
        if (eventSources.current[provider]) {
            eventSources.current[provider].close();
            delete eventSources.current[provider];
        }

        setLoading(prev => ({ ...prev, [provider]: true }));
        setProgress(prev => ({ ...prev, [provider]: 0 }));
        setProviderErrors(prev => ({ ...prev, [provider]: null }));
        setError('');

        try {
            const formData = new FormData();
            formData.append('resume', resume);
            formData.append('jobUrl', jobUrl);
            formData.append('apiKey', apiKey);
            formData.append('provider', provider);

            const response = await fetch(`${BACKEND_URL}/api/customize-resume`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let serverError = 'Failed to process request';
                try {
                    const errorData = await response.json();
                    serverError = errorData.error || serverError;
                } catch (parseError) {
                    serverError = response.statusText || serverError;
                }
                throw new Error(serverError);
            }

            const { jobId } = await response.json();

            // Open SSE stream for pushed job updates
            const es = new EventSource(`${BACKEND_URL}/api/job/${jobId}/stream`);
            eventSources.current[provider] = es;

            es.onmessage = (event) => {
                let job;
                try {
                    job = JSON.parse(event.data);
                } catch (_) {
                    return; // ignore unparseable frames
                }

                // Update progress bar
                if (typeof job.progress === 'number') {
                    setProgress(prev => ({ ...prev, [provider]: job.progress }));
                }

                if (job.status === 'completed') {
                    es.close();
                    delete eventSources.current[provider];
                    setResults(prev => ({ ...prev, [provider]: job.result }));
                    setLoading(prev => ({ ...prev, [provider]: false }));
                } else if (job.status === 'failed') {
                    es.close();
                    delete eventSources.current[provider];
                    setLoading(prev => ({ ...prev, [provider]: false }));
                    let errorMessage = job.error || 'Something went wrong';
                    const lowerError = errorMessage.toLowerCase();
                    if (lowerError.includes('quota') || lowerError.includes('429')) {
                        errorMessage = `${provider} API quota exceeded. Please check your billing or try again later.`;
                    } else if (lowerError.includes('unauthorized') || lowerError.includes('401')) {
                        errorMessage = `Invalid ${provider} API key. Please check your key and try again.`;
                    } else if (lowerError.includes('403') || lowerError.includes('forbidden')) {
                        errorMessage = `${provider} API access denied. Check your permissions.`;
                    }
                    setProviderErrors(prev => ({ ...prev, [provider]: errorMessage }));
                }
                // status 'pending' or 'processing': keep stream open
            };

            es.onerror = () => {
                es.close();
                delete eventSources.current[provider];
                setLoading(prev => ({ ...prev, [provider]: false }));
                setProviderErrors(prev => ({ ...prev, [provider]: 'Connection lost while waiting for job to complete. Please try again.' }));
            };

        } catch (err) {
            let errorMessage = err.message || 'Something went wrong';

            // Handle connection errors (server not running)
            if (err.message && err.message.includes('fetch')) {
                errorMessage = "The backend server isn't running. Did you forget to start it? Run 'node server.js' in the backend directory.";
            } else {
                const lowerError = errorMessage.toLowerCase();
                if (lowerError.includes('quota') || lowerError.includes('429')) {
                    errorMessage = `${provider} API quota exceeded. Please check your billing or try again later.`;
                } else if (lowerError.includes('unauthorized') || lowerError.includes('401')) {
                    errorMessage = `Invalid ${provider} API key. Please check your key and try again.`;
                } else if (lowerError.includes('403') || lowerError.includes('forbidden')) {
                    errorMessage = `${provider} API access denied. Check your permissions.`;
                } else if (lowerError.includes('api error')) {
                    errorMessage = `${provider}: ${errorMessage}`;
                }
            }

            setProviderErrors(prev => ({ ...prev, [provider]: errorMessage }));
            setError(errorMessage);
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

            const response = await fetch(`${BACKEND_URL}/api/format-document`, {
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
                                        Customizing... (up to 60s)
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
                                        Customizing... (up to 60s)
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
                                        Customizing... (up to 60s)
                                    </>
                                ) : (
                                    <>Claude</>
                                )}
                            </button>
                        </div>

                        {/* Progress bars — shown while a provider is loading */}
                        {(loading.openai || loading.gemini || loading.claude) && (
                            <div className="space-y-2">
                                {loading.openai && (
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                            <span>OpenAI</span>
                                            <span>{progress.openai}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${progress.openai}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {loading.gemini && (
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                            <span>Gemini</span>
                                            <span>{progress.gemini}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${progress.gemini}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {loading.claude && (
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                            <span>Claude</span>
                                            <span>{progress.claude}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${progress.claude}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                            {!results.openai && providerErrors.openai && (
                                <div className="border-l-4 border-red-300 pl-6">
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-red-800 mb-1">OpenAI failed</p>
                                            <p className="text-sm text-red-700">{providerErrors.openai}</p>
                                        </div>
                                        <button
                                            onClick={() => handleSubmit('openai')}
                                            disabled={loading.openai}
                                            className="flex items-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            )}
                            {results.gemini && (
                                <DownloadSection
                                    title="Gemini Results"
                                    results={results.gemini}
                                    downloadFile={downloadFile}
                                    color="blue"
                                />
                            )}
                            {!results.gemini && providerErrors.gemini && (
                                <div className="border-l-4 border-red-300 pl-6">
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-red-800 mb-1">Gemini failed</p>
                                            <p className="text-sm text-red-700">{providerErrors.gemini}</p>
                                        </div>
                                        <button
                                            onClick={() => handleSubmit('gemini')}
                                            disabled={loading.gemini}
                                            className="flex items-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            )}
                            {results.claude && (
                                <DownloadSection
                                    title="Claude Results"
                                    results={results.claude}
                                    downloadFile={downloadFile}
                                    color="purple"
                                />
                            )}
                            {!results.claude && providerErrors.claude && (
                                <div className="border-l-4 border-red-300 pl-6">
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-red-800 mb-1">Claude failed</p>
                                            <p className="text-sm text-red-700">{providerErrors.claude}</p>
                                        </div>
                                        <button
                                            onClick={() => handleSubmit('claude')}
                                            disabled={loading.claude}
                                            className="flex items-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Provider error cards when no results have loaded at all yet */}
                {!(results.openai || results.gemini || results.claude) && (providerErrors.openai || providerErrors.gemini || providerErrors.claude) && (
                    <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Results</h2>
                        <div className="space-y-4">
                            {providerErrors.openai && (
                                <div className="border-l-4 border-red-300 pl-6">
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-red-800 mb-1">OpenAI failed</p>
                                            <p className="text-sm text-red-700">{providerErrors.openai}</p>
                                        </div>
                                        <button
                                            onClick={() => handleSubmit('openai')}
                                            disabled={loading.openai}
                                            className="flex items-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            )}
                            {providerErrors.gemini && (
                                <div className="border-l-4 border-red-300 pl-6">
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-red-800 mb-1">Gemini failed</p>
                                            <p className="text-sm text-red-700">{providerErrors.gemini}</p>
                                        </div>
                                        <button
                                            onClick={() => handleSubmit('gemini')}
                                            disabled={loading.gemini}
                                            className="flex items-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
                            )}
                            {providerErrors.claude && (
                                <div className="border-l-4 border-red-300 pl-6">
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-red-800 mb-1">Claude failed</p>
                                            <p className="text-sm text-red-700">{providerErrors.claude}</p>
                                        </div>
                                        <button
                                            onClick={() => handleSubmit('claude')}
                                            disabled={loading.claude}
                                            className="flex items-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Retry
                                        </button>
                                    </div>
                                </div>
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

                {/* Previous Results / History */}
                {history.length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mt-8">
                        <button
                            className="w-full flex items-center justify-between text-left"
                            onClick={() => setShowHistory(prev => !prev)}
                        >
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-gray-500" />
                                <span className="text-lg font-semibold text-gray-900">
                                    Previous Results
                                </span>
                                <span className="text-sm text-gray-500 font-normal">({history.length})</span>
                            </div>
                            {showHistory ? (
                                <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                                <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                        </button>

                        {showHistory && (
                            <div className="mt-4">
                                <div className="flex justify-end mb-3">
                                    <button
                                        onClick={() => {
                                            localStorage.removeItem('resume_history');
                                            setHistory([]);
                                            setShowHistory(false);
                                        }}
                                        className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Clear history
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {history.map((entry, idx) => {
                                        const date = new Date(entry.timestamp);
                                        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                                        const truncatedUrl = (entry.jobUrl || 'Unknown URL').length > 60
                                            ? (entry.jobUrl || '').slice(0, 60) + '…'
                                            : (entry.jobUrl || 'Unknown URL');
                                        const providers = Object.entries(entry.results || {})
                                            .filter(([, v]) => v)
                                            .map(([k]) => k)
                                            .join(', ');
                                        return (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between gap-4 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{truncatedUrl}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {dateStr} at {timeStr}
                                                        {providers && <span className="ml-2 text-gray-400">• {providers}</span>}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setResults(entry.results)}
                                                    className="flex-shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;