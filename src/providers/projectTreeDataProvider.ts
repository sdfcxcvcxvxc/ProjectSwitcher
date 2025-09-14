// src/providers/projectTreeDataProvider.ts - Updated with Big Warning after Hard Reset
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectConfig, ProjectTreeItem, WorkspaceMode } from '../models/models';
import { getDynamicOrder, getEnabledProjectsWithDynamicOrder } from '../utils/projectUtils';

export class ProjectTreeDataProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: ProjectTreeItem): ProjectTreeItem {
        return element;
    }

    getChildren(element?: ProjectTreeItem): Thenable<ProjectTreeItem[]> {
        if (!element) {
            const items: ProjectTreeItem[] = [];

            // Always show Enable/Disable toggle at the top
            const toggleItem = this.createToggleItem();
            items.push(toggleItem);

            // If Project Switcher is enabled, show all projects
            if (state.isProjectSwitcherEnabled) {
                const sortedProjects = [...state.projects].sort((a, b) => a.order - b.order);
                items.push(...sortedProjects.map(project => this.createProjectTreeItem(project)));

                if (sortedProjects.length === 0) {
                    const noProjectsItem = new vscode.TreeItem('No projects configured') as ProjectTreeItem;
                    noProjectsItem.description = 'Projects will appear here';
                    noProjectsItem.projectId = '';
                    noProjectsItem.project = {} as ProjectConfig;
                    items.push(noProjectsItem);
                }
            } else {
                // Show helpful info when disabled
                items.push(...this.getDisabledModeItems());
            }

            // Always add Hard Reset option with separator
            const separatorItem = this.createSeparatorItem();
            const hardResetItem = this.createHardResetItem();

            items.push(separatorItem, hardResetItem);

            // NEW: Add big warning item right after Hard Reset
            const bigWarningItem = this.createBigWarningItem();
            items.push(bigWarningItem);

            if (!state.isProjectSwitcherEnabled && this.hasNonDefaultExcludes()) {
                items.push(this.createOldWarningItem());
            }

            return Promise.resolve(items);
        }

        return Promise.resolve([]);
    }

    private createToggleItem(): ProjectTreeItem {
        const isEnabled = state.isProjectSwitcherEnabled;
        const item = new vscode.TreeItem(
            isEnabled ? 'Disable Project Switcher' : 'Enable Project Switcher'
        ) as ProjectTreeItem;

        item.iconPath = new vscode.ThemeIcon(
            isEnabled ? 'stop-circle' : 'play-circle',
            new vscode.ThemeColor(isEnabled ? 'terminal.ansiRed' : 'terminal.ansiGreen')
        );

        item.description = isEnabled ? 'Show all folders' : 'Organize project folders';
        item.tooltip = isEnabled ?
            'Click to disable Project Switcher and show all folders' :
            'Click to enable Project Switcher and organize project folders';

        item.command = {
            command: 'project-switcher.toggleMode',
            title: isEnabled ? 'Disable Project Switcher' : 'Enable Project Switcher'
        };

        item.projectId = '';
        item.project = {} as ProjectConfig;
        item.contextValue = 'toggleItem';

        return item;
    }

    private createSeparatorItem(): ProjectTreeItem {
        const item = new vscode.TreeItem('─────────────────────') as ProjectTreeItem;
        item.description = '';
        item.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
        item.projectId = '';
        item.project = {} as ProjectConfig;
        item.contextValue = 'separator';
        item.tooltip = 'Emergency options below';
        return item;
    }

    private createHardResetItem(): ProjectTreeItem {
        const item = new vscode.TreeItem('Hard Reset (if has error)') as ProjectTreeItem;

        item.iconPath = new vscode.ThemeIcon('trash', new vscode.ThemeColor('terminal.ansiRed'));
        item.description = 'Clear all extension data';
        item.tooltip = 'WARNING: This will completely reset the extension and clear all project data, sessions, and workspace settings. Use only if the extension is in an error state.';

        item.command = {
            command: 'project-switcher.hardReset',
            title: 'Hard Reset Extension'
        };

        item.projectId = '';
        item.project = {} as ProjectConfig;
        item.contextValue = 'hardReset';

        return item;
    }

    // NEW: Create big warning item - double height and very prominent
    private createBigWarningItem(): ProjectTreeItem {
        const item = new vscode.TreeItem('🚨🚨 BEFORE UNINSTALLING EXTENSION 🚨🚨') as ProjectTreeItem;

        item.description = 'MUST READ BEFORE REMOVING EXTENSION!';
        item.iconPath = new vscode.ThemeIcon('alert', new vscode.ThemeColor('errorForeground'));

        // Enhanced tooltip with critical information
        item.tooltip = `🚨 CRITICAL WARNING 🚨

BEFORE uninstalling this extension, you MUST:

1. Click "Disable Project Switcher" button above
2. OR click "Hard Reset (if has error)" option above

If you uninstall without doing this:
❌ Some folders may remain hidden forever
❌ Your workspace .vscode/settings.json will keep hiding folders
❌ You'll need to manually edit settings.json to fix it

ALWAYS clean up before uninstalling!

Click this warning to see detailed removal instructions.`;

        // Make it highly visible with resource URI for custom styling
        item.resourceUri = vscode.Uri.parse('warning:big-removal');

        item.command = {
            command: 'project-switcher.showRemovalWarning',
            title: 'Show Critical Removal Warning'
        };

        item.projectId = '';
        item.project = {} as ProjectConfig;
        item.contextValue = 'bigRemovalWarning';

        return item;
    }

    // Rename old warning to avoid confusion
    private createOldWarningItem(): ProjectTreeItem {
        const item = new vscode.TreeItem('⚠️ Folders might be hidden') as ProjectTreeItem;

        item.description = 'Click to fix hidden folders';
        item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('terminal.ansiYellow'));
        item.tooltip = 'Extension settings might be hiding folders. Click to clean up workspace settings.';
        item.command = {
            command: 'project-switcher.cleanupSettings',
            title: 'Clean Up Settings'
        };

        item.projectId = '';
        item.project = {} as ProjectConfig;
        item.contextValue = 'oldWarning';

        return item;
    }

    private hasNonDefaultExcludes(): boolean {
        const config = vscode.workspace.getConfiguration();
        const currentExcludes = config.get<{ [key: string]: boolean }>('files.exclude') || {};

        const defaultExcludes = {
            '**/.git': true,
            '**/.svn': true,
            '**/.hg': true,
            '**/.DS_Store': true,
            '**/Thumbs.db': true
        };

        // Check if there are any non-default exclude patterns
        return Object.keys(currentExcludes).some(key =>
            !(key in defaultExcludes) && currentExcludes[key] === true
        );
    }

    private getDisabledModeItems(): ProjectTreeItem[] {
        const items: ProjectTreeItem[] = [];

        // Show warning if non-default excludes are present
        if (this.hasNonDefaultExcludes()) {
            const warningItem = new vscode.TreeItem('⚠️ WARNING: Folders might be hidden') as ProjectTreeItem;
            warningItem.description = 'Click to fix';
            warningItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));
            warningItem.tooltip = 'Extension settings might be hiding folders. Click to clean up workspace settings.';
            warningItem.command = {
                command: 'project-switcher.cleanupSettings',
                title: 'Clean Up Settings'
            };
            warningItem.projectId = '';
            warningItem.project = {} as ProjectConfig;
            items.push(warningItem);
        }

        if (state.workspaceMode === WorkspaceMode.ParentDirectory) {
            const infoItem = new vscode.TreeItem('Multi-folder workspace detected') as ProjectTreeItem;
            infoItem.description = 'Click "Enable" above to organize';
            infoItem.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('terminal.ansiBlue'));
            infoItem.tooltip = 'This workspace contains multiple folders. Enable Project Switcher to manage them as separate projects.';
            infoItem.projectId = '';
            infoItem.project = {} as ProjectConfig;
            items.push(infoItem);

        } else if (state.workspaceMode === WorkspaceMode.SingleProject) {
            const infoItem = new vscode.TreeItem('Single project workspace') as ProjectTreeItem;
            infoItem.description = 'Project Switcher not needed';
            infoItem.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('terminal.ansiBlue'));
            infoItem.tooltip = 'This workspace contains a single project. Project Switcher is designed for parent directories with multiple project folders.';
            infoItem.projectId = '';
            infoItem.project = {} as ProjectConfig;
            items.push(infoItem);

        } else {
            const noWorkspaceItem = new vscode.TreeItem('No workspace open') as ProjectTreeItem;
            noWorkspaceItem.description = 'Open a folder first';
            noWorkspaceItem.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('terminal.ansiYellow'));
            noWorkspaceItem.projectId = '';
            noWorkspaceItem.project = {} as ProjectConfig;
            items.push(noWorkspaceItem);
        }

        return items;
    }

    private createProjectTreeItem(project: ProjectConfig): ProjectTreeItem {
        const isCurrentProject = project.id === state.currentProjectId;
        const sessionEnabled = project.sessionEnabled !== false;
        const hasSession = state.sessions.has(project.id);

        // Check if project should be disabled/dimmed
        const isProjectEnabled = project.enabled !== false; // Default to true

        let projectName: string;

        if (isProjectEnabled) {
            // Show dynamic order for enabled projects
            const dynamicOrder = getDynamicOrder(project.id);
            projectName = `[${dynamicOrder}] ${project.name}`;
        } else {
            // Show only folder name for disabled projects (no number)
            projectName = project.name;
        }

        const item = new vscode.TreeItem(
            projectName,
            vscode.TreeItemCollapsibleState.None
        ) as ProjectTreeItem;

        item.projectId = project.id;
        item.project = project;

        // Set context value for different menu items
        if (isProjectEnabled) {
            item.contextValue = 'project';
        } else {
            item.contextValue = 'disabledProject';
        }

        // Show current project with different styling
        if (isCurrentProject && isProjectEnabled) {
            item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
            let description = '(active)';

            if (sessionEnabled) {
                description += hasSession ? ' • session saved' : ' • session enabled';
            } else {
                description += ' • session disabled';
            }

            if (state.workspaceFilter?.isCurrentlyFiltering()) {
                description += ' • filtered';
            }

            item.description = description;
        } else if (isProjectEnabled) {
            item.iconPath = new vscode.ThemeIcon('circle-outline');

            let description = '';
            if (sessionEnabled && hasSession) {
                description = '• session saved';
            } else if (!sessionEnabled) {
                description = '• session disabled';
            }
            item.description = description;
        } else {
            // Disabled project styling - dimmed appearance with special icon
            item.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('disabledForeground'));
            item.description = '• disabled';

            // Make the label appear dimmed
            item.resourceUri = vscode.Uri.parse(`disabled:${project.name}`);
        }

        // Enhanced tooltip with dynamic order info
        const projectPath = project.path;
        const lastUsedDate = new Date(project.lastUsed).toLocaleString();

        let tooltip = `${project.name}\nPath: ${projectPath}\nLast used: ${lastUsedDate}`;

        if (project.description) {
            tooltip += `\nDescription: ${project.description}`;
        }

        tooltip += `\nSession Management: ${sessionEnabled ? 'Enabled' : 'Disabled'}`;

        if (sessionEnabled && hasSession) {
            const session = state.sessions.get(project.id);
            if (session) {
                const sessionDate = new Date(session.lastSaved).toLocaleString();
                tooltip += `\nSession saved: ${sessionDate} (${session.tabs.length} tabs)`;
            }
        }

        if (isCurrentProject && state.workspaceFilter) {
            const filterStatus = state.workspaceFilter.isCurrentlyFiltering() ?
                'Active (showing only this project)' :
                'Disabled (showing all folders)';
            tooltip += `\nFiltering: ${filterStatus}`;
        }

        // Enhanced shortcut info with dynamic order explanation
        if (isProjectEnabled) {
            const dynamicOrder = getDynamicOrder(project.id);
            tooltip += `\nShortcut: Ctrl+Alt+${dynamicOrder} (dynamic based on enabled projects)`;
        } else {
            tooltip += `\nOriginal order: ${project.order} (disabled - no shortcut)`;
            tooltip += `\nWhen re-enabled, will be assigned to next available position`;
        }

        if (!isProjectEnabled) {
            tooltip += `\nStatus: Disabled`;
            tooltip += `\nClick enable icon to re-enable`;
        } else {
            tooltip += `\nClick disable icon to disable project`;
        }

        // Direct click to switch project (only for enabled projects)
        if (isProjectEnabled) {
            item.command = {
                command: 'project-switcher.switchProject',
                title: 'Switch to Project',
                arguments: [item]
            };
        }

        return item;
    }
}