'use strict';

const cache = require('../services/cache/resultCache');

describe('resultCache', () => {
    afterEach(() => cache.clear());

    test('miss returns null', () => {
        expect(cache.get('absent')).toBeNull();
    });

    test('set then get returns the stored value', () => {
        const key = cache.keyFor('openai', 'http://x', Buffer.from('resume'));
        cache.set(key, { resume: 'R' });
        expect(cache.get(key)).toEqual({ resume: 'R' });
    });

    test('key is deterministic and provider-sensitive', () => {
        const buf = Buffer.from('resume');
        expect(cache.keyFor('openai', 'http://x', buf)).toBe(cache.keyFor('openai', 'http://x', buf));
        expect(cache.keyFor('openai', 'http://x', buf)).not.toBe(cache.keyFor('claude', 'http://x', buf));
    });

    test('different resume bytes or URL produce different keys', () => {
        const url = 'http://x';
        expect(cache.keyFor('openai', url, Buffer.from('a'))).not.toBe(cache.keyFor('openai', url, Buffer.from('b')));
        expect(cache.keyFor('openai', 'http://a', Buffer.from('r'))).not.toBe(cache.keyFor('openai', 'http://b', Buffer.from('r')));
    });
});
