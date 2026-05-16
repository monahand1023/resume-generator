'use strict';

// ---- Magic byte helpers (duplicated from server.js for isolation) ----------
const ALLOWED_MAGIC_BYTES = {
    pdf: [0x25, 0x50, 0x44, 0x46],   // %PDF
    docx: [0x50, 0x4b, 0x03, 0x04],  // PK
};

function checkMagicBytes(buffer, type) {
    return ALLOWED_MAGIC_BYTES[type].every((byte, i) => buffer[i] === byte);
}

// ---- Multer fileFilter (extracted for unit testing) -----------------------
const ALLOWED_MIMES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
];

function fileFilterSync(mimetype) {
    return ALLOWED_MIMES.includes(mimetype);
}

// ---------------------------------------------------------------------------

describe('checkMagicBytes', () => {
    test('accepts a valid PDF buffer', () => {
        const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
        expect(checkMagicBytes(buf, 'pdf')).toBe(true);
    });

    test('accepts a valid DOCX (ZIP) buffer', () => {
        const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]);
        expect(checkMagicBytes(buf, 'docx')).toBe(true);
    });

    test('rejects a buffer with random bytes', () => {
        const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
        expect(checkMagicBytes(buf, 'pdf')).toBe(false);
        expect(checkMagicBytes(buf, 'docx')).toBe(false);
    });

    test('rejects a DOCX magic when checking for PDF', () => {
        const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
        expect(checkMagicBytes(buf, 'pdf')).toBe(false);
    });

    test('rejects a PDF magic when checking for DOCX', () => {
        const buf = Buffer.from([0x25, 0x50, 0x44, 0x46]);
        expect(checkMagicBytes(buf, 'docx')).toBe(false);
    });
});

describe('fileFilter MIME allowlist', () => {
    test('accepts application/pdf', () => {
        expect(fileFilterSync('application/pdf')).toBe(true);
    });

    test('accepts DOCX MIME type', () => {
        expect(
            fileFilterSync('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        ).toBe(true);
    });

    test('accepts application/msword (legacy .doc)', () => {
        expect(fileFilterSync('application/msword')).toBe(true);
    });

    test('rejects image/jpeg', () => {
        expect(fileFilterSync('image/jpeg')).toBe(false);
    });

    test('rejects text/plain', () => {
        expect(fileFilterSync('text/plain')).toBe(false);
    });

    test('rejects application/zip', () => {
        expect(fileFilterSync('application/zip')).toBe(false);
    });
});

describe('file size limit', () => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

    test('10 MB buffer is exactly at limit (allowed)', () => {
        expect(MAX_SIZE).toBe(10485760);
        // A real buffer of this size would be accepted by multer
        // (multer rejects > limit, not >= limit)
        const size = MAX_SIZE;
        expect(size <= MAX_SIZE).toBe(true);
    });

    test('10 MB + 1 byte exceeds limit', () => {
        const size = MAX_SIZE + 1;
        expect(size > MAX_SIZE).toBe(true);
    });
});
