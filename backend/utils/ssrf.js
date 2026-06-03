'use strict';

const net = require('net');
const dns = require('dns').promises;

/**
 * SSRF protection for user-supplied job URLs.
 *
 * Port of the Go service's ValidateJobURL (internal/scraper/scraper.go): only
 * http/https is allowed, the hostname is DNS-resolved, and every resolved
 * address is rejected if it falls in a private/reserved range — so a public
 * hostname that points at an internal IP (DNS-rebinding style) is still caught.
 *
 * Known residual: there is a TOCTOU window between this lookup and the actual
 * fetch (the browser resolves DNS again). This matches the Go original's
 * protection level and covers the realistic metadata/private-IP cases.
 */

// Private / reserved CIDR blocks that must never be reachable via a job URL.
const PRIVATE_SUBNETS = [
    ['10.0.0.0', 8, 'ipv4'],
    ['172.16.0.0', 12, 'ipv4'],
    ['192.168.0.0', 16, 'ipv4'],
    ['169.254.0.0', 16, 'ipv4'], // link-local + cloud metadata (AWS/GCP/Azure 169.254.169.254)
    ['127.0.0.0', 8, 'ipv4'], // loopback
    ['0.0.0.0', 8, 'ipv4'],
    ['100.64.0.0', 10, 'ipv4'], // RFC 6598 shared address space
    ['fc00::', 7, 'ipv6'], // unique local
    ['fe80::', 10, 'ipv6'], // link-local
    ['::1', 128, 'ipv6'], // loopback
];

const blockList = new net.BlockList();
for (const [addr, prefix, type] of PRIVATE_SUBNETS) {
    blockList.addSubnet(addr, prefix, type);
}

class SsrfError extends Error {}

/**
 * Throws SsrfError if `address` is in a blocked range. Handles IPv4-mapped
 * IPv6 addresses (e.g. ::ffff:127.0.0.1) by also checking the embedded v4.
 *
 * @param {string} address
 * @param {4|6} family
 */
function assertPublicAddress(address, family) {
    const type = family === 6 ? 'ipv6' : 'ipv4';
    if (blockList.check(address, type)) {
        throw new SsrfError('URL resolves to a private/reserved IP address');
    }
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the embedded IPv4 to avoid bypass.
    if (family === 6) {
        const m = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address);
        if (m && blockList.check(m[1], 'ipv4')) {
            throw new SsrfError('URL resolves to a private/reserved IP address');
        }
    }
}

/**
 * Validates that `rawUrl` is safe to fetch. Resolves on success; rejects with an
 * SsrfError (or Error) describing why the URL was refused.
 *
 * @param {string} rawUrl
 * @returns {Promise<void>}
 */
async function validateJobUrl(rawUrl) {
    let u;
    try {
        u = new URL(rawUrl);
    } catch {
        throw new SsrfError('invalid URL');
    }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new SsrfError(`URL scheme must be http or https, got: ${u.protocol.replace(':', '')}`);
    }

    let hostname = u.hostname;
    // new URL keeps IPv6 literals bracketed in .hostname — strip for lookup.
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        hostname = hostname.slice(1, -1);
    }

    let addrs;
    try {
        addrs = await dns.lookup(hostname, { all: true });
    } catch {
        throw new SsrfError(`cannot resolve hostname ${hostname}`);
    }

    if (addrs.length === 0) {
        throw new SsrfError(`cannot resolve hostname ${hostname}`);
    }

    for (const { address, family } of addrs) {
        assertPublicAddress(address, family);
    }
}

module.exports = { validateJobUrl, SsrfError };
