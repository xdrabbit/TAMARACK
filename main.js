const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const {
    DEFAULT_DATA: DEFAULT_SHELL_SNIPPETS_DATA,
    loadShellSnippetsData,
    buildShellSnippetEntries,
    buildShellSnippetExport
} = require('./shell-snippets');

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
    const shellSnippetsData = await getShellSnippetsData();
    return [
        ...libraryData,
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
    await ensureLibraryFile();
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
    ipcMain.handle('get-library', () => libraryData);
    ipcMain.handle('search-library', (event, query) => {
        const q = query.toLowerCase();
        return libraryData.filter(entry => matchesKnowledgeQuery(entry, q));
    });
    ipcMain.handle('get-hud-entries', async () => {
        return getHudEntries();
    });
    ipcMain.handle('search-hud-entries', async (event, query) => {
        const q = query.toLowerCase();
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
        const index = libraryData.findIndex(entry => entry.id === id);
        if (index !== -1) {
            libraryData[index] = { ...libraryData[index], ...updates };
            await saveLibraryData();
            return libraryData[index];
        }
        return null;
    });
    ipcMain.handle('delete-entry', async (event, id) => {
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
