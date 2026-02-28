require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Configuration ──────────────────────────────────────────────────────────
const YANDEX_TOKEN = process.env.YANDEX_TOKEN || '';
const YANDEX_DISK_PATH = process.env.YANDEX_DISK_PATH || 'disk:/KTP/ktp.json';
const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk/resources';

const yandexHeaders = {
    'Authorization': `OAuth ${YANDEX_TOKEN}`,
    'Content-Type': 'application/json',
};

// ─── Auth Config ─────────────────────────────────────────────────────────────
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'vfcnth69';

// In-memory session store: token -> { user, createdAt }
const sessions = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Auth middleware — used on protected API routes
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token && sessions.has(token)) {
        req.user = sessions.get(token).user;
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));

// ─── Auth Routes (public) ─────────────────────────────────────────────────────

/**
 * POST /api/login  Body: { login, password }
 * Returns { token } on success or 401 with { error }.
 */
app.post('/api/login', (req, res) => {
    const { login, password } = req.body || {};
    if (login === AUTH_USER && password === AUTH_PASSWORD) {
        const token = generateToken();
        sessions.set(token, { user: login, createdAt: Date.now() });
        console.log(`[AUTH] ✅ User '${login}' logged in.`);
        res.json({ success: true, token, user: login });
    } else {
        console.warn(`[AUTH] ❌ Failed login for '${login}'.`);
        res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
    }
});

/**
 * GET /api/auth-check
 * Returns { valid: true, user } or 401.
 */
app.get('/api/auth-check', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token && sessions.has(token)) {
        res.json({ valid: true, user: sessions.get(token).user });
    } else {
        res.status(401).json({ valid: false });
    }
});

/**
 * POST /api/logout
 */
app.post('/api/logout', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token) sessions.delete(token);
    console.log('[AUTH] User logged out.');
    res.json({ success: true });
});

// ─── Static files ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getDownloadLink() {
    const url = `${YANDEX_API_BASE}/download?path=${encodeURIComponent(YANDEX_DISK_PATH)}`;
    const res = await fetch(url, { headers: yandexHeaders });
    if (!res.ok) throw new Error(`Yandex Disk download link error ${res.status}: ${await res.text()}`);
    return (await res.json()).href;
}

async function getUploadLink() {
    const url = `${YANDEX_API_BASE}/upload?path=${encodeURIComponent(YANDEX_DISK_PATH)}&overwrite=true`;
    const res = await fetch(url, { headers: yandexHeaders });
    if (!res.ok) throw new Error(`Yandex Disk upload link error ${res.status}: ${await res.text()}`);
    return (await res.json()).href;
}

// ─── Protected API Routes ───────────────────────────────────────────────────

/** GET /api/ktp — Download ktp.json */
app.get('/api/ktp', requireAuth, async (req, res) => {
    try {
        console.log('[YANDEX] Downloading ktp.json...');
        const downloadUrl = await getDownloadLink();
        const fileRes = await fetch(downloadUrl);
        if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`);
        const data = await fileRes.json();
        console.log('[YANDEX] ✅ ktp.json downloaded.');
        res.json(data);
    } catch (err) {
        console.error('[YANDEX] ❌ Download error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/ktp — Upload ktp.json */
app.post('/api/ktp', requireAuth, async (req, res) => {
    try {
        console.log('[YANDEX] Uploading ktp.json...');
        if (!req.body) return res.status(400).json({ error: 'No body.' });
        const uploadUrl = await getUploadLink();
        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: JSON.stringify(req.body, null, 2),
        });
        if (uploadRes.status === 200 || uploadRes.status === 201) {
            console.log('[YANDEX] ✅ ktp.json uploaded.');
            res.json({ success: true, message: 'Файл успешно сохранён на Яндекс Диск' });
        } else {
            throw new Error(`Upload failed: ${uploadRes.status} - ${await uploadRes.text()}`);
        }
    } catch (err) {
        console.error('[YANDEX] ❌ Upload error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/yandex/status — Check Yandex Disk connection */
app.get('/api/yandex/status', requireAuth, async (req, res) => {
    try {
        const diskRes = await fetch('https://cloud-api.yandex.net/v1/disk/', { headers: yandexHeaders });
        if (!diskRes.ok) return res.status(401).json({ connected: false, error: await diskRes.text() });
        const data = await diskRes.json();
        res.json({ connected: true, user: data.user?.login || '?', totalSpace: data.total_space, usedSpace: data.used_space });
    } catch (err) {
        res.status(500).json({ connected: false, error: err.message });
    }
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════════╗`);
    console.log(`║   KTP Web Planner — сервер запущен                ║`);
    console.log(`║   http://localhost:${PORT}                            ║`);
    console.log(`║   Яндекс Диск: ${YANDEX_DISK_PATH}      ║`);
    console.log(`╚══════════════════════════════════════════════════╝\n`);
});
