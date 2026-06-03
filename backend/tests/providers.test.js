'use strict';

const registry = require('../services/ai');
const bedrock = require('../services/ai/providers/bedrock');
const openai = require('../services/ai/providers/openai');

describe('provider registry', () => {
    test('lists the core providers', () => {
        const ids = registry.listProviders().map((p) => p.id);
        expect(ids).toEqual(expect.arrayContaining(['openai', 'gemini', 'claude', 'bedrock']));
    });

    test('getProvider returns null for an unknown id', () => {
        expect(registry.getProvider('nope')).toBeNull();
    });

    describe('validateKey', () => {
        test('rejects an unknown provider', () => {
            expect(registry.validateKey('nope', 'x')).toBe('Invalid provider');
        });
        test('requires a key for user-key providers', () => {
            expect(registry.validateKey('openai', '')).toMatch(/required/);
        });
        test('enforces the key prefix', () => {
            expect(registry.validateKey('openai', 'bad')).toMatch(/must start with "sk-"/);
            expect(registry.validateKey('claude', 'sk-nope')).toMatch(/sk-ant-/);
            expect(registry.validateKey('gemini', 'nope')).toMatch(/AIza/);
        });
        test('accepts a well-formed key', () => {
            expect(registry.validateKey('openai', 'sk-abc')).toBeNull();
            expect(registry.validateKey('claude', 'sk-ant-abc')).toBeNull();
            expect(registry.validateKey('gemini', 'AIzaABC')).toBeNull();
        });
        test('server-credential providers need no key', () => {
            expect(registry.validateKey('bedrock', '')).toBeNull();
        });
    });

    test('describeProviders is serializable and exposes no functions', () => {
        for (const p of registry.describeProviders()) {
            expect(typeof p.id).toBe('string');
            expect(typeof p.available).toBe('boolean');
            expect(p).not.toHaveProperty('customize');
        }
    });
});

describe('bedrock provider', () => {
    const ORIGINAL_ENV = { ...process.env };
    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    test('availability honors BEDROCK_ENABLED', () => {
        process.env.BEDROCK_ENABLED = 'true';
        expect(bedrock.__hasAwsCredentials()).toBe(true);
        process.env.BEDROCK_ENABLED = 'false';
        expect(bedrock.__hasAwsCredentials()).toBe(false);
    });

    test('customize parses a Nova response', async () => {
        bedrock.__setClientForTest({
            send: async () => ({
                body: new TextEncoder().encode(
                    JSON.stringify({
                        output: { message: { content: [{ text: 'NAME: Jane Doe' }] } },
                        usage: { inputTokens: 5, outputTokens: 7 },
                    })
                ),
            }),
        });
        const out = await bedrock.customize({ resumeText: 'r', jobDescription: 'j', type: 'resume' });
        expect(out).toBe('NAME: Jane Doe');
    });

    test('customize throws on empty Nova content', async () => {
        bedrock.__setClientForTest({
            send: async () => ({
                body: new TextEncoder().encode(JSON.stringify({ output: { message: { content: [] } } })),
            }),
        });
        await expect(
            bedrock.customize({ resumeText: 'r', jobDescription: 'j', type: 'resume' })
        ).rejects.toThrow(/Bedrock API error/);
    });
});

describe('openai provider (mocked fetch)', () => {
    afterEach(() => {
        delete global.fetch;
    });

    test('returns content on success', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'RESULT' } }] }),
        }));
        const out = await openai.customize({ resumeText: 'r', jobDescription: 'j', apiKey: 'sk-x', type: 'resume' });
        expect(out).toBe('RESULT');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('surfaces the API error message', async () => {
        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: async () => ({ error: { message: 'bad key' } }),
        }));
        await expect(
            openai.customize({ resumeText: 'r', jobDescription: 'j', apiKey: 'sk-x', type: 'resume' })
        ).rejects.toThrow(/OpenAI API error: bad key/);
    });
});
