#!/usr/bin/env node
/**
 * TAMARACK Knowledge HUD - LAN server
 * Run on the central host (e.g. blackbird):
 *   node server.js
 *   # or npm run serve
 *
 * Clients connect with:
 *   TAMARACK_SERVER=http://blackbird.local:4777 npm start
 *
 * Single source of truth for user knowledge entries.
 * Shell snippets stay local on each client (repo-backed).
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 4777;
const DATA_DIR = process.env.TAMARACK_DATA_DIR || path.join(os.homedir(), '.config', 'tamarack-server');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

let libraryData = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadLibrary() {
  try {
    if (fs.existsSync(LIBRARY_FILE)) {
      const raw = fs.readFileSync(LIBRARY_FILE, 'utf8');
      libraryData = JSON.parse(raw);
      // Normalize ids to strings for consistency with new UUIDs
      libraryData = libraryData.map((entry) => ({
        ...entry,
        id: String(entry.id)
      }));
    } else {
      libraryData = [];
      saveLibrary();
    }
  } catch (err) {
    console.error('Failed to load library:', err);
    libraryData = [];
  }
}

function saveLibrary() {
  try {
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(libraryData, null, 2));
  } catch (err) {
    console.error('Failed to save library:', err);
  }
}

function matchesKnowledgeQuery(entry, query) {
  const q = (query || '').toLowerCase();
  if (!q) return true;
  const searchFields = [
    entry.title,
    entry.content,
    entry.code,
    entry.category,
    entry.platform,
    entry.riskLevel,
    entry.notes,
    ...(entry.tags || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return searchFields.includes(q);
}

function generateId() {
  return crypto.randomUUID();
}

const app = express();
app.use(express.json({ limit: '2mb' }));

// Very open CORS for LAN use. Tighten later if desired.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, entries: libraryData.length, time: new Date().toISOString() });
});

app.get('/api/entries', (req, res) => {
  res.json(libraryData);
});

app.get('/api/search', (req, res) => {
  const q = req.query.q || '';
  const results = libraryData.filter((entry) => matchesKnowledgeQuery(entry, q));
  res.json(results);
});

// HUD endpoints return *only* user knowledge. Clients merge with local shell snippets.
app.get('/api/hud-entries', (req, res) => {
  res.json(libraryData);
});

app.get('/api/search-hud', (req, res) => {
  const q = req.query.q || '';
  const results = libraryData.filter((entry) => matchesKnowledgeQuery(entry, q));
  res.json(results);
});

app.post('/api/entries', (req, res) => {
  const { title, type, content, tags } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const newEntry = {
    id: generateId(),
    title: String(title).trim(),
    type: type === 'code' ? 'code' : 'note',
    content: String(content).trim(),
    tags: Array.isArray(tags) ? tags.map(String) : [],
    created: new Date().toISOString()
  };

  libraryData.push(newEntry);
  saveLibrary();
  console.log(`[server] added entry ${newEntry.id} "${newEntry.title}"`);
  res.status(201).json(newEntry);
});

app.put('/api/entries/:id', (req, res) => {
  const id = String(req.params.id);
  const index = libraryData.findIndex((e) => String(e.id) === id);
  if (index === -1) {
    return res.status(404).json({ error: 'not found' });
  }

  const updates = req.body || {};
  const current = libraryData[index];

  const updated = {
    ...current,
    ...updates,
    id: current.id, // never allow id change
    updated: new Date().toISOString()
  };

  if (updates.tags && Array.isArray(updates.tags)) {
    updated.tags = updates.tags.map(String);
  }

  libraryData[index] = updated;
  saveLibrary();
  console.log(`[server] updated entry ${id}`);
  res.json(updated);
});

app.delete('/api/entries/:id', (req, res) => {
  const id = String(req.params.id);
  const before = libraryData.length;
  libraryData = libraryData.filter((e) => String(e.id) !== id);
  if (libraryData.length === before) {
    return res.status(404).json({ error: 'not found' });
  }
  saveLibrary();
  console.log(`[server] deleted entry ${id}`);
  res.json({ ok: true });
});

// Optional passthroughs (clients usually use their local copies)
app.get('/api/shell-snippets', (req, res) => {
  res.status(501).json({ error: 'shell snippets are served locally by clients from the repo' });
});

app.get('/api/shell-export', (req, res) => {
  res.status(501).json({ error: 'shell export is generated locally by clients' });
});

function start() {
  ensureDataDir();
  loadLibrary();

  let currentPort = Number(PORT);
  const maxAttempts = 10;

  const tryListen = () => {
    const server = app.listen(currentPort, '0.0.0.0');

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (currentPort === Number(PORT)) {
          console.error(`\n⚠️  Port ${currentPort} is already in use.`);
          console.error('Trying next available port...');
        }
        server.close(() => {
          currentPort++;
          if (currentPort > Number(PORT) + maxAttempts) {
            console.error(`\n❌ Port ${PORT} is already in use.`);
            console.error('Another process (or a previous server) is listening on 0.0.0.0:' + PORT);
            console.error('\nWhat you can do right now:');
            console.error('  • Try a different port:   PORT=4778 npm run serve');
            console.error('  • Find the process:');
            console.error('      lsof -i :' + PORT + '     # macOS and Linux');
            console.error('      ss -tuln | grep ' + PORT);
            console.error('  • Kill a stale TAMARACK server (if safe):');
            console.error('      pkill -f "node server.js"   or   kill $(lsof -t -i:' + PORT + ')');
            process.exit(1);
          }
          tryListen();
        });
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });

    server.once('listening', () => {
      const addr = server.address();
      console.log(`TAMARACK server listening on http://${addr.address}:${addr.port}`);
      console.log(`Data file: ${LIBRARY_FILE}`);
      console.log(`Entries loaded: ${libraryData.length}`);
      console.log('Clients can connect with: TAMARACK_SERVER=http://blackbird.local:' + addr.port + ' npm start');
    });
  };

  tryListen();
}

start();