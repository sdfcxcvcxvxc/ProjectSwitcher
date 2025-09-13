# Project Switcher

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/KhanhRomVN/ProjectSwitcher)
[![GitHub issues](https://img.shields.io/github/issues/KhanhRomVN/ProjectSwitcher)](https://github.com/KhanhRomVN/ProjectSwitcher/issues)
[![GitHub stars](https://img.shields.io/github/stars/KhanhRomVN/ProjectSwitcher)](https://github.com/KhanhRomVN/ProjectSwitcher/stargazers)

A powerful Visual Studio Code extension that enables seamless switching between project folders while preserving your tabs, sessions, and workspace state. Perfect for developers working with multiple projects in a single workspace or managing monorepos with multiple sub-projects.

## 🚀 Key Features

### 🔄 **Smart Project Switching**

- Switch between projects instantly with preserved context
- Automatic workspace filtering to show only the active project
- Keyboard shortcuts (Ctrl+Alt+1-9) for lightning-fast navigation
- Visual status bar indicator with filtering status

### 💾 **Intelligent Session Management**

- Preserve open tabs, cursor positions, and selections
- Automatic session saving on project switch
- Manual session save/restore capabilities
- Per-project session management settings

### 🎯 **Workspace Filtering**

- Show only the active project folder in the explorer
- Hide irrelevant folders to reduce clutter
- Toggle filtering on/off with a single command
- Maintains original workspace configuration

### ⚡ **Productivity Features**

- Auto-detection of parent directory workspaces
- Project ordering and management
- Session status indicators
- Comprehensive logging for troubleshooting

## 📦 Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X`)
3. Search for "Project Switcher"
4. Click Install

### From Source

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Install the generated `.vsix` file

## 🛠️ Usage

### Getting Started

1. **Open a Parent Directory Workspace**

   ```
   my-workspace/
   ├── project-1/
   ├── project-2/
   ├── project-3/
   └── shared-resources/
   ```

2. **Enable Project Switcher**

   - The extension automatically detects parent directory workspaces
   - Click "Enable Project Switcher" when prompted
   - Or use the command palette: `Project Switcher: Toggle Project Switcher`

3. **Select Your Projects**
   - Choose which folders should be managed as projects
   - The extension supports up to 9 projects with keyboard shortcuts

### Core Workflow

#### 🔀 Switching Projects

- **Status Bar**: Click the project name in the status bar
- **Keyboard**: Use `Ctrl+Alt+1` through `Ctrl+Alt+9`
- **Command Palette**: `Project Switcher: Show Project Menu`
- **Project Panel**: Click on any project in the sidebar

#### 💾 Managing Sessions

- **Auto-save**: Sessions are saved automatically when switching
- **Manual save**: Right-click project → "Save Session"
- **Clear session**: Right-click project → "Clear Session"
- **Toggle session management**: Enable/disable per project

#### 🎯 Controlling Workspace Filtering

- **Toggle filtering**: `Ctrl+Alt+F` or use the filter button
- **Auto-enabled**: Filtering is enabled by default when switching
- **Show all folders**: Disable filtering to see the full workspace

### Project Management

#### Adding Projects

Projects are automatically created from selected folders when enabling Project Switcher.

#### Editing Projects

- Right-click any project → "Edit Project"
- Modify name and description
- Projects are ordered 1-9 for keyboard shortcuts

#### Removing Projects

- Right-click any project → "Remove Project"
- Confirms deletion and clears associated sessions

## ⚙️ Configuration

### Available Settings

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

#### Setting Details

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

- **Parent Directory Structure**: A workspace containing 2+ subdirectories
- **Organized Projects**: Each subdirectory represents a separate project
- **File-based Projects**: Projects containing actual source files (not just documentation)

## 🎯 Use Cases

### 🏢 **Monorepo Management**

Perfect for monorepos with multiple applications:

```
my-monorepo/
├── frontend-app/     # React application
├── backend-api/      # Node.js API
├── mobile-app/       # React Native app
├── shared-lib/       # Shared utilities
└── documentation/    # Project docs
```

### 🔧 **Multi-Project Development**

Ideal for related projects in one workspace:

```
client-projects/
├── website/          # Main website
├── admin-panel/      # Admin interface
├── api-server/       # Backend API
└── mobile-app/       # Mobile application
```

### 📚 **Learning & Tutorials**

Great for course materials and practice projects:

```
learning-react/
├── lesson-01-basics/
├── lesson-02-hooks/
├── lesson-03-routing/
├── final-project/
└── resources/
```

## 🚀 Advanced Features

### Session Management Details

**What Gets Saved:**

- Open files and their tab positions
- Cursor positions and selections
- Active editor and view column
- Dirty/unsaved file status
- Pinned tab status

**Session Filtering:**

- Only saves tabs belonging to the current project
- Automatically filters out tabs from other projects
- Validates file existence on restore
- Handles missing files gracefully

### Workspace Filtering Mechanics

**Intelligent Filtering:**

- Hides non-active project folders
- Preserves original workspace configuration
- Automatically closes tabs from other projects
- Restores full workspace when disabled

**Filter States:**

- **Enabled**: Shows only active project folder
- **Disabled**: Shows all workspace folders
- **Auto-toggle**: Automatically enables when switching projects

## 🐛 Troubleshooting

### Common Issues

#### Extension Not Activating

- Ensure you're in a workspace with 2+ subdirectories
- Check that subdirectories contain actual files (not just README/LICENSE)
- Try reloading the window: `Developer: Reload Window`

#### Sessions Not Saving

- Verify session management is enabled for the project
- Check that files belong to the current project directory
- Enable debug logging to see session save attempts

#### Filtering Not Working

- Ensure workspace filtering is enabled in settings
- Check that original configuration is properly stored
- Try disabling and re-enabling Project Switcher

### Debug Information

Enable debug logging:

```json
{
  "projectSwitcher.logLevel": "debug"
}
```

View logs: `View > Output > Project Switcher`

### Getting Help

1. **Check the [Issues](https://github.com/KhanhRomVN/ProjectSwitcher/issues)** for known problems
2. **Enable debug logging** and check the Output panel
3. **Create a new issue** with:
   - VS Code version
   - Extension version
   - Workspace structure
   - Error logs/screenshots

## 🚧 Roadmap

### Upcoming Features

- **🎨 Custom Project Icons**: Set custom icons for each project
- **🏷️ Project Tags**: Organize projects with tags and categories
- **📊 Usage Analytics**: Track project usage and switch frequency
- **🔍 Global Search**: Search across all projects simultaneously
- **⚙️ Custom Commands**: Run project-specific commands on switch
- **🌐 Remote Workspace Support**: Support for remote development
- **💼 Project Templates**: Create new projects from templates

### Version History

#### 1.0.0 (Current)

- Initial release with core functionality
- Smart project switching with session preservation
- Workspace filtering and keyboard shortcuts
- Comprehensive project management

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### 🐛 Bug Reports

- Use the [issue template](https://github.com/KhanhRomVN/ProjectSwitcher/issues/new)
- Include detailed reproduction steps
- Provide VS Code and extension versions
- Attach relevant logs

### 💡 Feature Requests

- Check existing issues first
- Describe the use case and benefits
- Consider backward compatibility
- Provide mockups or examples if applicable

### 🔧 Code Contributions

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Follow the coding standards**:
   - TypeScript with strict mode
   - ESLint configuration
   - Comprehensive error handling
   - Detailed logging
4. **Add tests** for new functionality
5. **Update documentation** as needed
6. **Submit a pull request**

### Development Setup

```bash
# Clone the repository
git clone https://github.com/KhanhRomVN/ProjectSwitcher.git
cd ProjectSwitcher

# Install dependencies
npm install

# Start development
npm run watch

# Build for production
npm run build:prod

# Run tests
npm test

# Lint code
npm run lint:fix
```

### Code Structure

```
src/
├── extension.ts           # Main extension entry point
├── commands/             # Command implementations
│   ├── index.ts
│   └── projectCommands.ts
├── models/               # Data models and types
│   └── models.ts
├── providers/            # Tree view providers
│   └── projectTreeDataProvider.ts
└── utils/                # Utility classes
    ├── logger.ts
    ├── projectUtils.ts
    ├── sessionManager.ts
    └── workspaceFilter.ts
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### MIT License Summary

- ✅ **Commercial use**
- ✅ **Modification**
- ✅ **Distribution**
- ✅ **Private use**
- ❌ **Liability**
- ❌ **Warranty**

## 👨‍💻 Author

**KhanhRomVN**

- GitHub: [@KhanhRomVN](https://github.com/KhanhRomVN)
- Email: [khanhromvn@gmail.com](mailto:khanhromvn@gmail.com)

## 🙏 Acknowledgments

### Inspiration & Credits

- **VS Code Team** for the excellent extension API and documentation
- **Community Contributors** for testing, feedback, and feature suggestions
- **Open Source Projects** that inspired the architecture and design patterns

### Special Thanks

- Thanks to the VS Code extension development community for best practices
- Beta testers who provided valuable feedback during development
- Contributors who helped improve documentation and code quality
- Users who reported bugs and suggested improvements

### Third-Party Libraries

This extension is built with vanilla TypeScript and VS Code APIs, with no external runtime dependencies. Development dependencies include:

- TypeScript for type safety
- ESLint for code quality
- Webpack for bundling
- Mocha for testing

## 📞 Support

### Getting Help

- **Documentation**: Read this README and check the [Wiki](https://github.com/KhanhRomVN/ProjectSwitcher/wiki)
- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/KhanhRomVN/ProjectSwitcher/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/KhanhRomVN/ProjectSwitcher/discussions)
- **Email**: Contact [khanhromvn@gmail.com](mailto:khanhromvn@gmail.com) for private inquiries

### Community

- **⭐ Star** the repository if you find it useful
- **🐛 Report bugs** to help improve the extension
- **💡 Suggest features** for future versions
- **📢 Share** with other developers who might benefit

---

**Made with ❤️ by KhanhRomVN**

_Boost your productivity with seamless project switching in VS Code!_

hoàn cảnh: folder đang có 2 folder con là "A" và "B"

- lỗi 1: khi chuyển từ enable sang disable thì chỉ hiển thị mỗi "A"
- yêu cầu 1: xóa "Switch to Project" ở project option vì thừa. thay vào đó click thẳng vào project là switch được rồi
- yêu cầu 2: xóa icon "Pencil" Edit Project và chức năng rename project
- yêu cầu 3: xóa icon Trash và tiinhs năng xóa project
  \_ yêu cầu 4: thêm bạt tắt project sẽ ko xóa project ra khjoir nhưng sẽ bị mờ đi và ẩn đi các option Up, Down.
- yêu cầu 5: xóaoption Togggle Session Mângerment
- lỗi 2: ở sidebar tôi đã enable nhưng ở statusbar thì vẫn có thông báo "Enale Project Switcher"
- đơn giản lại filter project để tránh lôi. đơn giản là project nào đang focus thì folder (projetc) đó hiển thị.)
