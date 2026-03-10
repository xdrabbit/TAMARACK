# Knowledge HUD - Global Knowledge Base

A system-wide knowledge base with instant HUD access via global hotkey.

## Features

- **Global Hotkey Access**: Press `Ctrl+Shift+0` anywhere to instantly open your knowledge base
- **HUD Interface**: Beautiful overlay that appears on top of any application
- **Search & Filter**: Real-time search through all your knowledge entries
- **Rich Content**: Support for Markdown notes and syntax-highlighted code
- **Management Interface**: Full CRUD operations for managing your knowledge base
- **Cross-Platform**: Works on Windows, macOS, and Linux

## Installation

1. Install dependencies:
```bash
npm install
```

2. Import existing library (optional):
```bash
npm run import
```

3. Start the application:
```bash
npm start
```

## Usage

### Global Access
- Press `Ctrl+Shift+0` from anywhere to open the knowledge HUD
- Start typing to search your knowledge base
- Click outside or press `Esc` to close

### Management
- The main window provides full management capabilities
- Add, edit, and delete knowledge entries
- Organize with tags and categories
- Support for both notes (Markdown) and code snippets

## Hotkey Configuration

The default hotkey is `Ctrl+Shift+0`. To change it, modify the `globalShortcut.register` line in `main.js`.

## Data Storage

Your knowledge base is stored in:
- **Windows**: `%APPDATA%\knowledge-hud\library.json`
- **macOS**: `~/Library/Application Support/knowledge-hud/library.json`
- **Linux**: `~/.config/knowledge-hud/library.json`

## Importing from Web Version

If you have an existing knowledge base from the web version:

1. Run the import script:
```bash
npm run import
```

This will copy your `library.json` from the web app to the Electron app.

## Development

To modify the application:

- `main.js`: Main Electron process
- `index.html`: Management interface
- `hud.html`: HUD overlay interface
- `import-library.js`: Data import utility

## Requirements

- Node.js 14+
- For Linux: X11 or Wayland display server

## Troubleshooting

### Hotkey not working
- Make sure no other application is using the same hotkey
- On Linux, you might need to install additional packages for global shortcuts

### HUD not appearing
- Check that the application is running in the system tray
- Try restarting the application

### Import not working
- Ensure the web app's `library.json` exists in the parent directory
- Check file permissions

## License

MIT