#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to the web app's library.json
const webAppLibrary = path.join(__dirname, '..', 'library.json');

// Path to Electron app's user data (this is a placeholder - will be set at runtime)
const electronDataDir = process.env.ELECTRON_DATA_DIR || path.join(require('os').homedir(), '.config', 'knowledge-hud');
const electronLibrary = path.join(electronDataDir, 'library.json');

console.log('Importing library from web app...');
console.log(`Source: ${webAppLibrary}`);
console.log(`Destination: ${electronLibrary}`);

try {
    // Ensure destination directory exists
    if (!fs.existsSync(electronDataDir)) {
        fs.mkdirSync(electronDataDir, { recursive: true });
    }

    // Copy the file if it exists
    if (fs.existsSync(webAppLibrary)) {
        const data = fs.readFileSync(webAppLibrary, 'utf8');
        fs.writeFileSync(electronLibrary, data);
        console.log('✅ Library imported successfully!');
        console.log(`Imported ${JSON.parse(data).length} entries`);
    } else {
        console.log('❌ Web app library.json not found. Creating empty library.');
        fs.writeFileSync(electronLibrary, JSON.stringify([]));
    }
} catch (error) {
    console.error('❌ Error importing library:', error.message);
    process.exit(1);
}