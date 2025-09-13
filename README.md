# Project Switcher

A VS Code extension that allows you to quickly switch between different project folders while preserving open tabs and editor sessions, without interrupting running processes like `npm run dev`.

## Features

- **Quick Project Switching**: Switch between up to 9 projects using keyboard shortcuts (Ctrl+Alt+1 to Ctrl+Alt+9)
- **Session Preservation**: Automatically saves and restores open tabs, cursor positions, and editor state when switching projects
- **Non-Disruptive**: Switches workspace folders without killing running terminals or processes
- **Visual Management**: Dedicated sidebar for managing projects with drag-and-drop ordering
- **Smart Detection**: Automatically detects current project when opening VS Code

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press `F5` to open a new VS Code window with the extension loaded

## Usage

### Adding Projects

1. Click the Project Switcher icon in the Activity Bar
2. Click the `+` button to add the current workspace as a project
3. Or use `Ctrl+Alt+Shift+A` to quickly add current project
4. Enter project name and optional description

### Switching Projects

- **Keyboard shortcuts**: `Ctrl+Alt+1` through `Ctrl+Alt+9` to switch to projects 1-9
- **Status bar**: Click the project name in the status bar to see quick switch menu
- **Sidebar**: Click on any project in the Project Switcher sidebar
- **Command palette**: Use "Project Switcher: Switch Project" command

### Managing Projects

- **Reorder**: Use up/down arrows in the sidebar to change project order (affects keyboard shortcuts)
- **Edit**: Click the edit icon to rename projects or change descriptions
- **Remove**: Click the remove icon to delete projects (this won't delete the actual folders)

### Session Management

The extension automatically:

- Saves your open tabs and their positions when switching projects
- Restores the previous session when returning to a project
- Preserves cursor positions and selections
- Maintains editor state across switches

## Configuration

Access settings via `File > Preferences > Settings` and search for "Project Switcher":

- `projectSwitcher.preserveTabs`: Enable/disable tab preservation (default: true)
- `projectSwitcher.autoSaveTabs`: Automatically save tab state when switching (default: true)

## Keyboard Shortcuts

| Command               | Shortcut           | Description                          |
| --------------------- | ------------------ | ------------------------------------ |
| Switch to Project 1-9 | `Ctrl+Alt+1-9`     | Quickly switch to numbered projects  |
| Add Project           | `Ctrl+Alt+Shift+A` | Add current workspace as new project |

## Architecture

The extension is built with:

- **TypeScript** for type safety and better development experience
- **Modular architecture** with separate utilities for projects, sessions, and UI
- **VS Code TreeView API** for the sidebar interface
- **Workspace API** for folder management
- **Global state persistence** for project and session data

## File Structure

```
src/
├── commands/           # Command implementations
│   ├── index.ts       # Command registry
│   └── projectCommands.ts
├── models/            # Data models and interfaces
│   └── models.ts
├── providers/         # VS Code tree view providers
│   └── projectTreeDataProvider.ts
├── utils/             # Utility modules
│   ├── logger.ts      # Logging utility
│   ├── projectUtils.ts # Project management
│   └── sessionManager.ts # Tab session management
└── extension.ts       # Main extension entry point
```

## Development

### Prerequisites

- Node.js 16+
- VS Code 1.50+

### Building

```bash
npm install
npm run compile
```

### Testing

```bash
npm run test
```

### Packaging

```bash
npm run package
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Sessions not restoring properly

- Check VS Code Output panel > "Project Switcher" for logs
- Ensure files haven't been moved or deleted
- Try refreshing the project list

### Projects not switching

- Verify project paths still exist
- Check if you have unsaved changes that might prevent switching
- Look for error messages in the status bar

### Performance issues

- Limit to 9 projects maximum for best performance
- Close unnecessary tabs before switching projects
- Check VS Code's workspace trust settings

## License

MIT License - see LICENSE file for details

## Changelog

### 0.0.1

- Initial release
- Basic project switching functionality
- Session preservation
- Keyboard shortcuts for 9 projects
- Project management UI
