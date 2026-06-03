import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Link, Key, FileText, Loader2, ChevronDown, ChevronUp, Clock, Trash2 } from 'lucide-react';
import DownloadSection from './components/DownloadSection';
import ChangesSection from './components/ChangesSection';
import ApiKeyInput from './components/ApiKeyInput';
import ProviderErrorCard from './components/ProviderErrorCard';
import { PROVIDERS, isKeyValid } from './config/providers';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

// Purge-safe column classes (built statically so a future compiled Tailwind
// build keeps them).
const MD_GRID_COLS = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };
const gridCols = (n) => `grid grid-cols-1 ${MD_GRID_COLS[n] || 'md:grid-cols-3'} gap-4`;

// Build a per-provider state object, e.g. { openai: false, gemini: false, ... }.
const perProvider = (value) => Object.fromEntries(PROVIDERS.map((p) => [p.id, value]));

function App() {
    const [keys, setKeys] = useState({});
    const [jobUrl, setJobUrl] = useState('');
    const [resume, setResume] = useState(null);
    const [loading, setLoading] = useState(() => perProvider(false));
    const [results, setResults] = useState(() => perProvider(null));
    const [providerErrors, setProviderErrors] = useState(() => perProvider(null));
    const [progress, setProgress] = useState(() => perProvider(0));
    const [showKeys, setShowKeys] = useState(() => perProvider(false));
    const [error, setError] = useState('');
    const [serverProviders, setServerProviders] = useState(null);
    const [history, setHistory] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('resume_history') || '[]');
        } catch (_) {
            return [];
        }
    });
    const [showHistory, setShowHistory] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    const eventSources = React.useRef({});

    // Load saved API keys from localStorage on mount.
    useEffect(() => {
        const loaded = {};
        PROVIDERS.forEach((p) => {
            if (p.usesServerCredentials) return;
            const saved = localStorage.getItem(`${p.id}_api_key`);
            if (saved) loaded[p.id] = saved;
        });
        setKeys((prev) => ({ ...prev, ...loaded }));
    }, []);

    // Ask the server which providers it actually supports (e.g. Bedrock only
    // when AWS is configured). Falls back to the user-key providers if the
    // backend is unreachable.
    useEffect(() => {
        fetch(`${BACKEND_URL}/api/providers`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data && Array.isArray(data.providers)) setServerProviders(data.providers);
            })
            .catch(() => {
                /* backend may be down — keep defaults */
            });
    }, []);

    // Persist results to history whenever a provider result arrives.
    useEffect(() => {
        if (!Object.values(results).some(Boolean)) return;
        setHistory((prev) => {
            const entry = { timestamp: new Date().toISOString(), jobUrl, results };
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

    // Close all EventSource connections on unmount.
    useEffect(() => {
        const sources = eventSources.current; // stable object; snapshot for the cleanup closure
        return () => {
            Object.values(sources).forEach((es) => es.close());
        };
    }, []);

    const setKey = (id, value) => {
        setKeys((prev) => ({ ...prev, [id]: value }));
        if (value) {
            localStorage.setItem(`${id}_api_key`, value);
        } else {
            localStorage.removeItem(`${id}_api_key`);
        }
    };

    const toggleShowKey = (id) => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));

    // Providers to show: those the server reports available, or (before that
    // response) the ones that don't depend on server credentials.
    const visibleProviders = useMemo(() => {
        return PROVIDERS.filter((p) => {
            if (serverProviders) {
                const match = serverProviders.find((sp) => sp.id === p.id);
                return match ? match.available : false;
            }
            return !p.usesServerCredentials;
        });
    }, [serverProviders]);

    const userKeyProviders = visibleProviders.filter((p) => !p.usesServerCredentials);
    const canSubmit = Boolean(jobUrl?.trim() && resume);
    const isReady = (provider) => provider.usesServerCredentials || isKeyValid(provider, keys[provider.id]);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const acceptFile = (file) => {
        if (file && (file.type === 'application/pdf' || file.type.includes('document'))) {
            setResume(file);
            setError('');
        } else {
            setError('Please upload a PDF or Word document');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
    };

    const handleFileUpload = (e) => acceptFile(e.target.files[0]);

    const personalizeError = (label, rawMessage) => {
        const message = rawMessage || 'Something went wrong';
        const lower = message.toLowerCase();
        if (lower.includes('quota') || lower.includes('429')) {
            return `${label} API quota exceeded. Please check your billing or try again later.`;
        }
        if (lower.includes('unauthorized') || lower.includes('401')) {
            return `Invalid ${label} API key. Please check your key and try again.`;
        }
        if (lower.includes('403') || lower.includes('forbidden')) {
            return `${label} API access denied. Check your permissions.`;
        }
        if (lower.includes('api error')) {
            return `${label}: ${message}`;
        }
        return message;
    };

    const handleSubmit = async (providerId) => {
        const provider = PROVIDERS.find((p) => p.id === providerId);
        const apiKey = (keys[providerId] || '').trim();
        const needsKey = !provider.usesServerCredentials;

        if ((needsKey && !apiKey) || !jobUrl || !resume) {
            setError('Please fill in all required fields');
            return;
        }

        if (eventSources.current[providerId]) {
            eventSources.current[providerId].close();
            delete eventSources.current[providerId];
        }

        setLoading((prev) => ({ ...prev, [providerId]: true }));
        setProgress((prev) => ({ ...prev, [providerId]: 0 }));
        setProviderErrors((prev) => ({ ...prev, [providerId]: null }));
        setError('');

        try {
            const formData = new FormData();
            formData.append('resume', resume);
            formData.append('jobUrl', jobUrl);
            formData.append('provider', providerId);
            if (apiKey) formData.append('apiKey', apiKey);

            const response = await fetch(`${BACKEND_URL}/api/customize-resume`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let serverError = 'Failed to process request';
                try {
                    const errorData = await response.json();
                    serverError = errorData.error || serverError;
                } catch (_parseError) {
                    serverError = response.statusText || serverError;
                }
                throw new Error(serverError);
            }

            const { jobId } = await response.json();

            const es = new EventSource(`${BACKEND_URL}/api/job/${jobId}/stream`);
            eventSources.current[providerId] = es;

            es.onmessage = (event) => {
                let job;
                try {
                    job = JSON.parse(event.data);
                } catch (_) {
                    return;
                }

                if (typeof job.progress === 'number') {
                    setProgress((prev) => ({ ...prev, [providerId]: job.progress }));
                }

                if (job.status === 'completed') {
                    es.close();
                    delete eventSources.current[providerId];
                    setResults((prev) => ({ ...prev, [providerId]: job.result }));
                    setLoading((prev) => ({ ...prev, [providerId]: false }));
                } else if (job.status === 'failed') {
                    es.close();
                    delete eventSources.current[providerId];
                    setLoading((prev) => ({ ...prev, [providerId]: false }));
                    setProviderErrors((prev) => ({
                        ...prev,
                        [providerId]: personalizeError(provider.label, job.error),
                    }));
                }
                // status 'pending' or 'processing': keep stream open
            };

            es.onerror = () => {
                es.close();
                delete eventSources.current[providerId];
                setLoading((prev) => ({ ...prev, [providerId]: false }));
                setProviderErrors((prev) => ({
                    ...prev,
                    [providerId]: 'Connection lost while waiting for job to complete. Please try again.',
                }));
            };
        } catch (err) {
            let errorMessage;
            if (err.message && err.message.includes('fetch')) {
                errorMessage =
                    "The backend server isn't running. Did you forget to start it? Run 'node server.js' in the backend directory.";
            } else {
                errorMessage = personalizeError(provider.label, err.message);
            }
            setProviderErrors((prev) => ({ ...prev, [providerId]: errorMessage }));
            setError(errorMessage);
            setLoading((prev) => ({ ...prev, [providerId]: false }));
        }
    };

    const generateFilename = (baseType, metadata, format) => {
        if (!metadata) return `${baseType}.${format}`;
        const { name, company, position } = metadata;
        const clean = (v, fallback) => (v || fallback).replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const cleanName = clean(name, 'Resume');
        const cleanCompany = clean(company, 'Company');
        const cleanPosition = clean(position, 'Position');
        const kind = baseType === 'resume' ? 'Resume' : 'CoverLetter';
        return `${cleanName}_${kind}_${cleanCompany}_${cleanPosition}.${format}`;
    };

    const downloadFormattedFile = async (content, baseFilename, format, metadata) => {
        try {
            const filename = generateFilename(baseFilename, metadata, format);
            const response = await fetch(`${BACKEND_URL}/api/format-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, format, filename: filename.replace(`.${format}`, ''), metadata }),
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

    const cleanMarkdown = (text) => {
        if (!text) return text;
        return text
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/_{2,}/g, '')
            .replace(/^_+|_+$/gm, '')
            .replace(/^#+\s*/gm, '')
            .replace(/`{1,3}/g, '')
            .trim();
    };

    const parseChangesData = (changesText) => {
        if (!changesText) return null;
        const lines = changesText.split('\n').filter((line) => line.trim());
        let metrics = '';
        const keyChanges = [];
        let currentChange = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('METRICS:')) {
                metrics = cleanMarkdown(trimmed.replace('METRICS:', '').trim());
            } else if (trimmed.includes('CHANGE:')) {
                if (currentChange) keyChanges.push(currentChange);
                currentChange = { title: cleanMarkdown(trimmed.replace('CHANGE:', '').trim()), before: '', after: '' };
            } else if (trimmed.includes('BEFORE:')) {
                if (currentChange) currentChange.before = cleanMarkdown(trimmed.replace('BEFORE:', '').trim());
            } else if (trimmed.includes('AFTER:')) {
                if (currentChange) currentChange.after = cleanMarkdown(trimmed.replace('AFTER:', '').trim());
            }
        }
        if (currentChange) keyChanges.push(currentChange);
        return { metrics, keyChanges };
    };

    const hasAnyResult = Object.values(results).some(Boolean);
    const hasAnyError = Object.values(providerErrors).some(Boolean);
    const anyLoading = visibleProviders.some((p) => loading[p.id]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Dan's Resume Customizer</h1>
                    <p className="text-gray-600">Upload your resume and job URL to get AI-customized resumes and cover letters</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                    <div className="space-y-6">
                        {/* API Keys Section */}
                        <div className="border-b pb-6">
                            <h2 className="flex items-center text-lg font-semibold text-gray-900 mb-4">
                                <Key className="w-5 h-5 mr-2" />
                                API Configuration
                            </h2>
                            <div className={gridCols(userKeyProviders.length)}>
                                {userKeyProviders.map((provider) => (
                                    <ApiKeyInput
                                        key={provider.id}
                                        provider={provider}
                                        value={keys[provider.id] || ''}
                                        onChange={setKey}
                                        show={showKeys[provider.id]}
                                        onToggleShow={toggleShowKey}
                                    />
                                ))}
                            </div>
                            {visibleProviders.some((p) => p.usesServerCredentials) && (
                                <p className="text-xs text-gray-500 mt-3">
                                    {visibleProviders
                                        .filter((p) => p.usesServerCredentials)
                                        .map((p) => p.label)
                                        .join(', ')}{' '}
                                    {visibleProviders.filter((p) => p.usesServerCredentials).length === 1 ? 'uses' : 'use'}{' '}
                                    server-side credentials — no API key needed.
                                </p>
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
                                            <p>Drag &amp; drop your resume or click to upload</p>
                                            <p className="text-xs mt-1">PDF or Word documents only</p>
                                        </div>
                                    )}
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
                        )}

                        {/* Action Buttons */}
                        <div className={gridCols(visibleProviders.length)}>
                            {visibleProviders.map((provider) => {
                                const ready = isReady(provider);
                                const enabled = ready && canSubmit;
                                return (
                                    <button
                                        key={provider.id}
                                        onClick={() => handleSubmit(provider.id)}
                                        disabled={!enabled || loading[provider.id]}
                                        className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center ${
                                            enabled
                                                ? `${provider.classes.button} text-white`
                                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        }`}
                                        title={
                                            !ready
                                                ? `Enter a valid ${provider.label} API key`
                                                : !canSubmit
                                                    ? 'Add job URL and upload resume'
                                                    : ''
                                        }
                                    >
                                        {loading[provider.id] ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Customizing... (up to 60s)
                                            </>
                                        ) : (
                                            <>{provider.label}</>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Progress bars */}
                        {anyLoading && (
                            <div className="space-y-2">
                                {visibleProviders
                                    .filter((p) => loading[p.id])
                                    .map((provider) => (
                                        <div key={provider.id}>
                                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                <span>{provider.label}</span>
                                                <span>{progress[provider.id]}%</span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div
                                                    className={`${provider.classes.progress} h-2 rounded-full transition-all duration-300`}
                                                    style={{ width: `${progress[provider.id]}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}

                        {/* Status Message */}
                        {(!jobUrl?.trim() || !resume) && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
                                <div className="flex items-start">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path
                                                fillRule="evenodd"
                                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm">
                                            To generate customized resumes, please:
                                            {!jobUrl?.trim() && !resume && ' add a job URL and upload your resume'}
                                            {!jobUrl?.trim() && resume && ' add a job URL'}
                                            {jobUrl?.trim() && !resume && ' upload your resume'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Download Section */}
                {hasAnyResult && (
                    <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Download Your Documents</h2>
                        <div className="space-y-6">
                            {PROVIDERS.map((provider) => {
                                if (results[provider.id]) {
                                    return (
                                        <DownloadSection
                                            key={provider.id}
                                            title={`${provider.label} Results`}
                                            results={results[provider.id]}
                                            downloadFile={downloadFile}
                                            color={provider.color}
                                        />
                                    );
                                }
                                if (providerErrors[provider.id]) {
                                    return (
                                        <ProviderErrorCard
                                            key={provider.id}
                                            provider={provider}
                                            message={providerErrors[provider.id]}
                                            onRetry={handleSubmit}
                                            disabled={loading[provider.id]}
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </div>
                )}

                {/* Error-only section when nothing has succeeded yet */}
                {!hasAnyResult && hasAnyError && (
                    <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Results</h2>
                        <div className="space-y-4">
                            {PROVIDERS.filter((p) => providerErrors[p.id]).map((provider) => (
                                <ProviderErrorCard
                                    key={provider.id}
                                    provider={provider}
                                    message={providerErrors[provider.id]}
                                    onRetry={handleSubmit}
                                    disabled={loading[provider.id]}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Changes Analysis */}
                {hasAnyResult && (
                    <div className="space-y-8">
                        {PROVIDERS.filter((p) => results[p.id]).map((provider) => (
                            <ChangesSection
                                key={provider.id}
                                title={`${provider.label} Analysis`}
                                results={results[provider.id]}
                                parseChangesData={parseChangesData}
                                color={provider.color}
                            />
                        ))}
                    </div>
                )}

                {/* Previous Results / History */}
                {history.length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mt-8">
                        <button
                            className="w-full flex items-center justify-between text-left"
                            onClick={() => setShowHistory((prev) => !prev)}
                        >
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-gray-500" />
                                <span className="text-lg font-semibold text-gray-900">Previous Results</span>
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
                                        const dateStr = date.toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        });
                                        const timeStr = date.toLocaleTimeString(undefined, {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        });
                                        const truncatedUrl =
                                            (entry.jobUrl || 'Unknown URL').length > 60
                                                ? (entry.jobUrl || '').slice(0, 60) + '…'
                                                : entry.jobUrl || 'Unknown URL';
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
