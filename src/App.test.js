import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import App from './App';

const SERVER_PROVIDERS = [
    { id: 'openai', label: 'OpenAI', usesServerCredentials: false, available: true, keyHint: 'sk-...' },
    { id: 'gemini', label: 'Gemini', usesServerCredentials: false, available: true, keyHint: 'AIza...' },
    { id: 'claude', label: 'Claude', usesServerCredentials: false, available: true, keyHint: 'sk-ant-...' },
    { id: 'bedrock', label: 'Bedrock', usesServerCredentials: true, available: true, keyHint: null },
];

const PREVIEW_DATA = {
    jobDescription: 'We are hiring a Senior Engineer at Acme Corp.',
    resumeText: 'Jane Doe — résumé text',
    metadata: { name: 'Jane Doe', company: 'Acme Corp', position: 'Senior Engineer' },
};

function mockProviders(providers) {
    global.fetch = jest.fn((url) => {
        const u = String(url);
        if (u.includes('/api/providers')) {
            return Promise.resolve({ ok: true, json: async () => ({ providers }) });
        }
        if (u.includes('/api/preview')) {
            return Promise.resolve({ ok: true, json: async () => PREVIEW_DATA });
        }
        return Promise.reject(new Error(`unexpected fetch: ${u}`));
    });
}

beforeEach(() => {
    localStorage.clear();
    mockProviders(SERVER_PROVIDERS);
});

afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
});

test('renders a key input for each user-key provider', async () => {
    render(<App />);
    expect(screen.getByLabelText('OpenAI API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Gemini API Key')).toBeInTheDocument();
    expect(screen.getByLabelText('Claude API Key')).toBeInTheDocument();
    // settle the /api/providers fetch-driven state update
    await screen.findByRole('button', { name: 'Bedrock' });
});

test('shows the Bedrock action (no key field) once the server reports it available', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bedrock' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Bedrock API Key')).not.toBeInTheDocument();
});

test('hides server-credential providers when the backend does not offer them', async () => {
    mockProviders(SERVER_PROVIDERS.filter((p) => p.id !== 'bedrock').map((p) => ({ ...p })));
    // act-wrap so the providers fetch settles inside the test (no Bedrock button
    // to wait on, since that's exactly what should be absent).
    await act(async () => {
        render(<App />);
    });
    expect(screen.queryByRole('button', { name: 'Bedrock' })).not.toBeInTheDocument();
});

test('validates key format in the UI', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Bedrock' }); // settle fetch state
    const input = screen.getByLabelText('OpenAI API Key');
    fireEvent.change(input, { target: { value: 'sk-looks-good' } });
    expect(screen.getByText('✓ Valid')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'not-a-key' } });
    expect(screen.getByText('✗ Invalid format')).toBeInTheDocument();
});

test('preview shows the scraped JD + detected metadata', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Bedrock' });

    fireEvent.change(screen.getByPlaceholderText('https://company.com/jobs/position'), {
        target: { value: 'https://example.com/job' },
    });
    const file = new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(document.getElementById('resume-upload'), { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Preview inputs/i }));

    await screen.findByText('What the AI will see');
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/We are hiring a Senior Engineer/)).toBeInTheDocument();
});
