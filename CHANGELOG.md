# Project Switcher

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)](https://github.com/KhanhRomVN/ProjectSwitcher)
[![GitHub issues](https://img.shields.io/github/issues/KhanhRomVN/ProjectSwitcher)](https://github.com/KhanhRomVN/ProjectSwitcher/issues)
[![GitHub stars](https://img.shields.io/github/stars/KhanhRomVN/ProjectSwitcher)](https://github.com/KhanhRomVN/ProjectSwitcher/stargazers)

A powerful Visual Studio Code extension that enables seamless switching between project folders while preserving your tabs, sessions, and workspace state. Perfect for developers working with multiple projects in a single workspace or managing monorepos with multiple sub-projects.

![Project Switcher Demo](https://raw.githubusercontent.com/KhanhRomVN/ProjectSwitcher/main/images/demo.gif)

## Features

### Smart Project Management

- **Auto-detection**: Automatically detects parent directory workspaces with multiple sub-projects
- **Instant switching**: Switch between projects with preserved context and state
- **Project ordering**: Organize projects with customizable order (1-9 for keyboard shortcuts)
- **Enable/disable projects**: Hide projects from quick switching while keeping their configuration

### Intelligent Session Management

- **Tab preservation**: Save and restore open tabs with cursor positions and selections
- **Project-specific sessions**: Each project maintains its own tab state
- **Automatic saving**: Sessions are saved automatically when switching projects
- **Manual control**: Save or clear sessions manually for any project
- **Smart filtering**: Only saves tabs belonging to the current project directory

### Workspace Filtering

- **Focus mode**: Show only the active project folder in the explorer
- **Auto-filtering**: Automatically enables when switching projects
- **Quick toggle**: Toggle filtering on/off with keyboard shortcut
- **Original preservation**: Maintains original workspace configuration when disabled

### Productivity Features

- **Keyboard shortcuts**: Quick project switching with `Ctrl+Alt+1-9`
- **Status bar integration**: Current project display with filtering indicator
- **Project menu**: Quick access via `Ctrl+Alt+M`
- **Visual indicators**: Clear status indicators for active projects and sessions

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X`)
3. Search for "Project Switcher"
4. Click **Install**

### Manual Installation

1. Download the latest `.vsix` file from [Releases](https://github.com/KhanhRomVN/ProjectSwitcher/releases)
2. Open VS Code
3. Run command `Extensions: Install from VSIX...`
4. Select the downloaded file

## Quick Start

### 1. Set Up Your Workspace

Open a folder containing multiple project directories:

```
my-workspace/
├── frontend-app/     # Your React/Vue/Angular app
├── backend-api/      # Your Node.js/Python API
├── mobile-app/       # Your React Native/Flutter app
├── shared-lib/       # Shared utilities
└── documentation/    # Project documentation
```

### 2. Enable Project Switcher

When you open a multi-project workspace, Project Switcher will automatically detect it and ask if you want to enable it. You can also:

- Click the **Enable Project Switcher** button in the sidebar
- Use Command Palette: `Project Switcher: Toggle Project Switcher`

### 3. Start Switching

- **Keyboard**: `Ctrl+Alt+1` through `Ctrl+Alt+9`
- **Menu**: `Ctrl+Alt+M` for quick project menu
- **Sidebar**: Click any project in the Project Switcher panel
- **Status Bar**: Click the current project name

## Usage Guide

### Project Management

#### Enabling/Disabling Projects

- **Enable**: Click the green checkmark icon next to a disabled project
- **Disable**: Click the red circle icon next to an enabled project
- **Impact**: Disabled projects are hidden from quick switching but retain their configuration

#### Reordering Projects

- Use the up/down arrow buttons to change project order
- Order determines keyboard shortcuts (`Ctrl+Alt+1` = order 1, etc.)

### Session Management

#### Automatic Sessions

- Sessions are automatically saved when switching between projects
- Only tabs belonging to the current project are saved
- Cursor positions, selections, and tab states are preserved

#### Manual Session Control

- **Save session**: Right-click project → "Save Session"
- **Clear session**: Right-click project → "Clear Session"
- **Disable sessions**: Turn off session management per project

### Workspace Filtering

#### How It Works

- Shows only the active project folder in VS Code's Explorer
- Hides other project folders to reduce clutter
- Automatically enables when switching projects

#### Toggle Filtering

- **Status bar**: Click the filter indicator
- **Command**: `Project Switcher: Toggle Project Filtering`
- **Manual**: Use the toggle button in project menu

## Keyboard Shortcuts

| Shortcut              | Action                        |
| --------------------- | ----------------------------- |
| `Ctrl+Alt+1-9`        | Switch to project by order    |
| `Ctrl+Alt+M`          | Open project switch menu      |
| Various context menus | Additional actions in sidebar |

_Note: On Mac, use `Cmd` instead of `Ctrl`_

## Configuration

### Extension Settings

```json
{
  "projectSwitcher.preserveTabs": true,
  "projectSwitcher.autoSaveTabs": true,
  "projectSwitcher.sessionManagementDefault": true,
  "projectSwitcher.enableFiltering": true,
  "projectSwitcher.enableKeyboardShortcuts": true,
  "projectSwitcher.autoEnableOnStartup": false,
  "projectSwitcher.logLevel": "info"
}
```

| Setting                    | Default  | Description                                           |
| -------------------------- | -------- | ----------------------------------------------------- |
| `preserveTabs`             | `true`   | Preserve open tabs when switching projects            |
| `autoSaveTabs`             | `true`   | Automatically save tab state when switching           |
| `sessionManagementDefault` | `true`   | Enable session management by default for new projects |
| `enableFiltering`          | `true`   | Enable project filtering by default                   |
| `enableKeyboardShortcuts`  | `true`   | Enable keyboard shortcuts (Ctrl+Alt+1-9)              |
| `autoEnableOnStartup`      | `false`  | Automatically enable for parent directory workspaces  |
| `logLevel`                 | `"info"` | Logging level: debug, info, warn, error               |

### Workspace Requirements

Project Switcher works best with:

- **Multi-folder workspaces**: 2 or more subdirectories
- **Project-based structure**: Each folder represents a distinct project
- **Active development**: Folders containing source code (not just documentation)

## Use Cases

### Monorepo Management

Perfect for monorepos with multiple applications:

```
my-monorepo/
├── web-app/          # React/Vue frontend
├── mobile-app/       # React Native/Flutter
├── api-server/       # Backend API
├── shared-lib/       # Shared utilities
└── docs/            # Documentation
```

### Multi-Project Workflows

Ideal for related projects:

```
client-work/
├── main-website/     # Primary website
├── admin-panel/      # Management interface
├── mobile-app/       # Mobile application
└── shared-assets/    # Common resources
```

### Learning and Development

Great for tutorials and practice:

```
learning-path/
├── basic-concepts/
├── intermediate-projects/
├── advanced-techniques/
└── final-capstone/
```

## Troubleshooting

### Common Issues

**Extension not activating**

- Ensure workspace has 2+ subdirectories with actual files
- Reload window: `Developer: Reload Window`
- Check Output panel: View → Output → Project Switcher

**Sessions not saving**

- Verify session management is enabled for the project
- Ensure files are within the project directory
- Check if tabs belong to external files

**Filtering not working**

- Verify filtering is enabled in settings
- Try disabling and re-enabling Project Switcher
- Check if original configuration was properly stored

### Debug Information

Enable detailed logging:

```json
{
  "projectSwitcher.logLevel": "debug"
}
```

View logs: `View → Output → Project Switcher`

### Getting Help

1. Check [existing issues](https://github.com/KhanhRomVN/ProjectSwitcher/issues)
2. Enable debug logging and check Output panel
3. Create a new issue with:
   - VS Code version and OS
   - Extension version
   - Workspace structure
   - Steps to reproduce
   - Error logs/screenshots

## Advanced Features

### Session Details

- **Tab filtering**: Only saves tabs within current project
- **State preservation**: Cursor positions, selections, dirty status
- **File validation**: Checks file existence before restoring
- **Graceful handling**: Skips missing files without errors

### Workspace Intelligence

- **Smart detection**: Identifies parent vs single project workspaces
- **Configuration backup**: Preserves original VS Code settings
- **Selective filtering**: Shows/hides folders without affecting settings
- **Restoration**: Completely restores original state when disabled

### Performance Optimization

- **Lazy loading**: Projects load only when needed
- **Efficient filtering**: Minimal performance impact
- **Smart caching**: Reduces repeated file system operations
- **Memory management**: Cleans up unused sessions

## Roadmap

### Upcoming Features

- **Custom project icons**: Visual customization
- **Project templates**: Quick project setup
- **Git integration**: Branch-aware switching
- **Remote workspace support**: Dev containers and codespaces
- **Project-specific settings**: Environment variables and configurations

### Version History

#### v1.0.3 (Current)

- Enhanced project disable/enable functionality
- Improved workspace filtering reliability
- Better session management with project-specific filtering
- Comprehensive error handling and logging

#### v1.0.0

- Initial stable release
- Core project switching functionality
- Session management and workspace filtering
- Keyboard shortcuts and UI integration

## Contributing

We welcome contributions! Here's how to get involved:

### Bug Reports

- Use the [issue template](https://github.com/KhanhRomVN/ProjectSwitcher/issues/new)
- Include reproduction steps and system information
- Attach relevant logs from Output panel

### Feature Requests

- Search existing issues first
- Describe the use case and expected behavior
- Consider providing mockups or examples

### Code Contributions

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Follow TypeScript best practices
4. Add tests for new functionality
5. Update documentation
6. Submit a pull request

### Development Setup

```bash
git clone https://github.com/KhanhRomVN/ProjectSwitcher.git
cd ProjectSwitcher
npm install
npm run watch    # Development mode
npm run build    # Production build
npm test         # Run tests
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/KhanhRomVN/ProjectSwitcher/issues)
- **Email**: [khanhromvn@gmail.com](mailto:khanhromvn@gmail.com)
- **Documentation**: [Wiki](https://github.com/KhanhRomVN/ProjectSwitcher/wiki)

## Author

**KhanhRomVN**

- GitHub: [@KhanhRomVN](https://github.com/KhanhRomVN)
- Email: [khanhromvn@gmail.com](mailto:khanhromvn@gmail.com)

---

**Boost your productivity with seamless project switching in VS Code!**

Made with care by KhanhRomVN
