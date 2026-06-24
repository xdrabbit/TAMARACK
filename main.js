const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const {
    DEFAULT_DATA: DEFAULT_SHELL_SNIPPETS_DATA,
    loadShellSnippetsData,
    buildShellSnippetEntries,
    buildShellSnippetExport
} = require('./shell-snippets');

// --- Remote server support (LAN mode) ---
// Set TAMARACK_SERVER=http://blackbird.local:4777
// or create ~/.config/tamarack/remote.json { "server": "http://..." }
// Falls back to fully local single-machine behavior when unset.
function getRemoteServerUrl() {
  if (process.env.TAMARACK_SERVER) return process.env.TAMARACK_SERVER.replace(/\/$/, '');
  try {
    const os = require('os');
    const configPath = path.join(os.homedir(), '.config', 'tamarack', 'remote.json');
    const raw = require('fs').readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg && cfg.server) return String(cfg.server).replace(/\/$/, '');
  } catch (_) {}
  // Also support a per-userData config for packaged convenience
  try {
    const cfgPath2 = path.join(app.getPath('userData'), 'remote.json');
    const raw2 = require('fs').readFileSync(cfgPath2, 'utf8');
    const cfg2 = JSON.parse(raw2);
    if (cfg2 && cfg2.server) return String(cfg2.server).replace(/\/$/, '');
  } catch (_) {}
  return null;
}

const remoteServerUrl = getRemoteServerUrl();
let remoteLibraryCache = [];
let isRemoteMode = !!remoteServerUrl;

if (isRemoteMode) {
  console.log(`[TAMARACK] Remote mode enabled → ${remoteServerUrl}`);
} else {
  console.log('[TAMARACK] Local mode (no TAMARACK_SERVER)');
}

let mainWindow;
let hudWindow;
let tray;
let libraryData = [];

const LIBRARY_FILE = path.join(app.getPath('userData'), 'library.json');

// Ensure library file exists
async function ensureLibraryFile() {
    try {
        await fs.access(LIBRARY_FILE);
    } catch {
        await fs.writeFile(LIBRARY_FILE, JSON.stringify([]));
    }
    loadLibraryData();
}

async function loadLibraryData() {
    try {
        const data = await fs.readFile(LIBRARY_FILE, 'utf8');
        libraryData = JSON.parse(data);
    } catch (error) {
        console.error('Error loading library:', error);
        libraryData = [];
    }
}

async function saveLibraryData() {
    try {
        await fs.writeFile(LIBRARY_FILE, JSON.stringify(libraryData, null, 2));
    } catch (error) {
        console.error('Error saving library:', error);
    }
}

async function getShellSnippetsData() {
    try {
        return await loadShellSnippetsData();
    } catch (error) {
        console.error('Error loading shell snippets:', error);

        return {
            ...DEFAULT_SHELL_SNIPPETS_DATA,
            exportPolicy: { ...DEFAULT_SHELL_SNIPPETS_DATA.exportPolicy },
            categoryOrder: [...DEFAULT_SHELL_SNIPPETS_DATA.categoryOrder],
            safetyRules: [...DEFAULT_SHELL_SNIPPETS_DATA.safetyRules],
            snippets: []
        };
    }
}

// --- Remote (LAN) data helpers ---
async function fetchJson(url, options = {}) {
  const full = remoteServerUrl + url;
  try {
    const res = await fetch(full, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Server ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  } catch (err) {
    if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed') || err.code === 'ECONNREFUSED') {
      const hint = `\n[Hint] Could not reach TAMARACK server at ${remoteServerUrl}.\nIs the server running? (Try "npm run serve" on blackbird)\nIs the port correct in TAMARACK_SERVER or your remote.json?`;
      console.error(hint);
    }
    throw err;
  }
}

async function remoteGetEntries() {
  try {
    const data = await fetchJson('/api/entries');
    remoteLibraryCache = Array.isArray(data) ? data.map(e => ({ ...e, id: String(e.id) })) : [];
    return remoteLibraryCache;
  } catch (err) {
    console.error('[remote] get entries failed:', err.message);
    return remoteLibraryCache; // serve stale cache
  }
}

async function remoteSearchEntries(query) {
  try {
    const data = await fetchJson('/api/search?q=' + encodeURIComponent(query || ''));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[remote] search failed:', err.message);
    return remoteLibraryCache.filter(e => matchesKnowledgeQuery(e, query || ''));
  }
}

async function remoteAddEntry(entry) {
  const created = await fetchJson('/api/entries', {
    method: 'POST',
    body: JSON.stringify(entry)
  });
  if (created && created.id) {
    remoteLibraryCache = [...remoteLibraryCache.filter(e => String(e.id) !== String(created.id)), { ...created, id: String(created.id) }];
  }
  return created;
}

async function remoteUpdateEntry(id, updates) {
  const updated = await fetchJson('/api/entries/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
  if (updated && updated.id) {
    const sid = String(updated.id);
    remoteLibraryCache = remoteLibraryCache.map(e => String(e.id) === sid ? { ...updated, id: sid } : e);
  }
  return updated;
}

async function remoteDeleteEntry(id) {
  await fetchJson('/api/entries/' + encodeURIComponent(id), { method: 'DELETE' });
  const sid = String(id);
  remoteLibraryCache = remoteLibraryCache.filter(e => String(e.id) !== sid);
  return true;
}

function matchesKnowledgeQuery(entry, query) {
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

    return searchFields.includes(query);
}

async function getHudEntries() {
    let userEntries = libraryData;
    if (isRemoteMode) {
        userEntries = await remoteGetEntries();
    }
    const shellSnippetsData = await getShellSnippetsData();
    return [
        ...userEntries,
        ...buildShellSnippetEntries(shellSnippetsData)
    ];
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: true, // Show for testing
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.png') // Add icon if available
    });

    mainWindow.loadFile('index.html');

    // Add tray icon
    createTray();
}

function createHUDWindow() {
    hudWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        show: false, // Hide by default, show on hotkey
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    hudWindow.loadFile('hud.html');

    // Center the HUD
    hudWindow.center();

    // Hide on blur (click outside)
    hudWindow.on('blur', () => {
        if (hudWindow && !hudWindow.isDestroyed()) {
            hudWindow.hide();
        }
    });
}

function createTray() {
    try {
        // On Linux, tray icons can be problematic, so we'll skip it for now
        // and rely on the main window and manual triggering
        console.log('Tray creation skipped on Linux - use main window to test HUD');

        // Alternative: show a notification or just log
        // For now, we'll make the main window always accessible

    } catch (error) {
        console.error('Tray error:', error);
    }
}

function toggleHUD() {
    console.log('Toggle HUD called. Current visibility:', hudWindow.isVisible());
    if (hudWindow.isVisible()) {
        hudWindow.hide();
        console.log('HUD hidden');
    } else {
        hudWindow.show();
        hudWindow.focus();
        console.log('HUD shown and focused');
    }
}

app.whenReady().then(async () => {
    if (!isRemoteMode) {
        await ensureLibraryFile();
    } else {
        // Warm the cache for fast HUD on startup
        remoteGetEntries().catch(() => {});
    }
    createMainWindow();
    createHUDWindow();

    // Try multiple global shortcuts for Linux compatibility
    const shortcuts = [
        'CommandOrControl+Shift+0',
        'CommandOrControl+Shift+9',
        'CommandOrControl+Alt+0',
        'CommandOrControl+Alt+9',
        'F12',
        'F11'
    ];

    let globalShortcutRegistered = false;
    for (const shortcut of shortcuts) {
        if (globalShortcut.register(shortcut, toggleHUD)) {
            console.log(`✅ Global shortcut ${shortcut} registered successfully`);
            globalShortcutRegistered = true;
            break;
        } else {
            console.log(`❌ Failed to register global shortcut ${shortcut}`);
        }
    }

    if (!globalShortcutRegistered) {
        console.log('ℹ️  Global shortcuts not available on this Linux setup - use local shortcuts or button instead');
    }

    // Add local shortcuts to main window
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key === '0') {
            event.preventDefault();
            toggleHUD();
            console.log('Local shortcut Ctrl+Shift+0 triggered');
        }
        if (input.control && input.shift && input.key === '9') {
            event.preventDefault();
            toggleHUD();
            console.log('Local shortcut Ctrl+Shift+9 triggered');
        }
        if (input.key === 'F12') {
            event.preventDefault();
            toggleHUD();
            console.log('Local shortcut F12 triggered');
        }
    });

    // Add local shortcuts to HUD window
    hudWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && input.shift && input.key === '0') {
            event.preventDefault();
            toggleHUD();
            console.log('HUD local shortcut Ctrl+Shift+0 triggered');
        }
        if (input.key === 'Escape') {
            event.preventDefault();
            hudWindow.hide();
            console.log('HUD hidden via Escape');
        }
    });

    // Log all registered shortcuts
    console.log('Registered shortcuts:', globalShortcut.isRegistered('CommandOrControl+Shift+0'));

    // IPC handlers
    // In remote mode these proxy to the central server on blackbird (or configured host).
    // In local mode they use the original file-backed behavior.
    ipcMain.handle('get-library', async () => {
        if (isRemoteMode) {
            return await remoteGetEntries();
        }
        return libraryData;
    });

    ipcMain.handle('search-library', async (event, query) => {
        const q = (query || '').toLowerCase();
        if (isRemoteMode) {
            return await remoteSearchEntries(q);
        }
        return libraryData.filter(entry => matchesKnowledgeQuery(entry, q));
    });

    ipcMain.handle('get-hud-entries', async () => {
        return getHudEntries();
    });

    ipcMain.handle('search-hud-entries', async (event, query) => {
        const q = (query || '').toLowerCase();
        const hudEntries = await getHudEntries();
        return hudEntries.filter(entry => matchesKnowledgeQuery(entry, q));
    });

    ipcMain.handle('get-shell-snippets', async () => {
        return getShellSnippetsData();
    });

    ipcMain.handle('get-shell-snippet-export', async () => {
        const shellSnippetsData = await getShellSnippetsData();
        return buildShellSnippetExport(shellSnippetsData);
    });

    ipcMain.handle('add-entry', async (event, entry) => {
        if (isRemoteMode) {
            return await remoteAddEntry(entry);
        }
        const newEntry = {
            id: Date.now(),
            ...entry,
            created: new Date().toISOString()
        };
        libraryData.push(newEntry);
        await saveLibraryData();
        return newEntry;
    });

    ipcMain.handle('update-entry', async (event, id, updates) => {
        if (isRemoteMode) {
            return await remoteUpdateEntry(id, updates);
        }
        const index = libraryData.findIndex(entry => entry.id === id);
        if (index !== -1) {
            libraryData[index] = { ...libraryData[index], ...updates };
            await saveLibraryData();
            return libraryData[index];
        }
        return null;
    });

    ipcMain.handle('delete-entry', async (event, id) => {
        if (isRemoteMode) {
            return await remoteDeleteEntry(id);
        }
        libraryData = libraryData.filter(entry => entry.id !== id);
        await saveLibraryData();
        return true;
    });

    ipcMain.on('hide-hud', () => {
        if (hudWindow && !hudWindow.isDestroyed()) {
            hudWindow.hide();
        }
    });

    ipcMain.on('show-hud', () => {
        toggleHUD();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
