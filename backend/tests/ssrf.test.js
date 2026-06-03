'use strict';

const { validateJobUrl, SsrfError } = require('../utils/ssrf');

describe('validateJobUrl', () => {
    test('allows a public IPv4 literal', async () => {
        await expect(validateJobUrl('http://8.8.8.8/jobs/123')).resolves.toBeUndefined();
    });

    test('allows https', async () => {
        await expect(validateJobUrl('https://1.1.1.1/careers')).resolves.toBeUndefined();
    });

    test.each([
        ['loopback', 'http://127.0.0.1/'],
        ['loopback hostname', 'http://localhost/'],
        ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
        ['private 10/8', 'http://10.1.2.3/'],
        ['private 192.168/16', 'http://192.168.0.5/'],
        ['private 172.16/12', 'http://172.16.5.5/'],
        ['shared 100.64/10', 'http://100.64.1.1/'],
        ['IPv6 loopback', 'http://[::1]/'],
        ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]/'],
    ])('rejects %s', async (_label, url) => {
        await expect(validateJobUrl(url)).rejects.toThrow(SsrfError);
    });

    test.each([
        ['file scheme', 'file:///etc/passwd'],
        ['ftp scheme', 'ftp://example.com/'],
        ['gopher scheme', 'gopher://example.com/'],
    ])('rejects non-http scheme: %s', async (_label, url) => {
        await expect(validateJobUrl(url)).rejects.toThrow(/scheme must be http/);
    });

    test('rejects a malformed URL', async () => {
        await expect(validateJobUrl('not a url')).rejects.toThrow(SsrfError);
    });

    test('rejects an unresolvable hostname', async () => {
        await expect(
            validateJobUrl('http://this-host-should-not-resolve.invalid/')
        ).rejects.toThrow(/cannot resolve/);
    });
});
