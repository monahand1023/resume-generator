'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'jobs.db');

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.exec(`
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                result TEXT,
                error TEXT,
                progress INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `);
    }
    return db;
}

const upsertJob = db => db.prepare(`
    INSERT INTO jobs (id, status, result, error, progress, created_at, updated_at)
    VALUES (@id, @status, @result, @error, @progress, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        result = excluded.result,
        error = excluded.error,
        progress = excluded.progress,
        updated_at = excluded.updated_at
`);

const deleteJob = db => db.prepare('DELETE FROM jobs WHERE id = ?');

const loadPendingJobs = db => db.prepare("SELECT * FROM jobs WHERE status NOT IN ('completed', 'failed')").all();

module.exports = { getDb, upsertJob, deleteJob, loadPendingJobs };
