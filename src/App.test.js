import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';

const SERVER_PROVIDERS = [
    { id: 'openai', label: 'OpenAI', usesServerCredentials: false, available: true, keyHint: 'sk-...' },
    { id: 'gemini', label: 'Gemini', usesServerCredentials: false, available: true, keyHint: 'AIza...' },
    { id: 'claude', label: 'Claude', usesServerCredentials: false, available: true, keyHint: 'sk-ant-...' },
    { id: 'bedrock', label: 'Bedrock', usesServerCredentials: true, available: true, keyHint: null },
];

function mockProviders(providers) {
    global.fetch = jest.fn((url) => {
        if (String(url).includes('/api/providers')) {
            return Promise.resolve({ ok: true, json: async () => ({ providers }) });
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
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
    render(<App />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bedrock' })).not.toBeInTheDocument());
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
