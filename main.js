const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

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
        show: false,
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
    if (hudWindow.isVisible()) {
        hudWindow.hide();
    } else {
        hudWindow.show();
        hudWindow.focus();
    }
}

app.whenReady().then(async () => {
    await ensureLibraryFile();
    createMainWindow();
    createHUDWindow();

    // Try to register global shortcut with error handling
    const success = globalShortcut.register('CommandOrControl+Shift+0', toggleHUD);

    if (success) {
        console.log('Global shortcut Ctrl+Shift+0 registered successfully');
    } else {
        console.error('Failed to register global shortcut Ctrl+Shift+0');
        // Try alternative hotkey
        const altSuccess = globalShortcut.register('CommandOrControl+Shift+9', toggleHUD);
        if (altSuccess) {
            console.log('Alternative shortcut Ctrl+Shift+9 registered');
        } else {
            console.error('Failed to register any global shortcuts');
        }
    }

    // Log all registered shortcuts
    console.log('Registered shortcuts:', globalShortcut.isRegistered('CommandOrControl+Shift+0'));

    // IPC handlers
    ipcMain.handle('get-library', () => libraryData);
    ipcMain.handle('search-library', (event, query) => {
        const q = query.toLowerCase();
        return libraryData.filter(entry =>
            entry.title.toLowerCase().includes(q) ||
            entry.content.toLowerCase().includes(q) ||
            (entry.tags && entry.tags.some(tag => tag.toLowerCase().includes(q)))
        );
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