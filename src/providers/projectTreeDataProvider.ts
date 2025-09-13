// src/providers/projectTreeDataProvider.ts - Updated with dynamic toggle icons
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectConfig, ProjectTreeItem, WorkspaceMode } from '../models/models';

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

    private getDisabledModeItems(): ProjectTreeItem[] {
        const items: ProjectTreeItem[] = [];

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

        const projectName = `[${project.order}] ${project.name}`;

        const item = new vscode.TreeItem(
            projectName,
            vscode.TreeItemCollapsibleState.None
        ) as ProjectTreeItem;

        item.projectId = project.id;
        item.project = project;

        // Set context value for different menu items - UPDATED to include enabled/disabled status
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
            // Disabled project styling - dimmed appearance
            item.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
            item.description = '• disabled';

            // Make the label appear dimmed
            item.resourceUri = vscode.Uri.parse(`disabled:${project.name}`);
        }

        // Enhanced tooltip
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

        tooltip += `\nShortcut: Ctrl+Alt+${project.order}`;

        if (!isProjectEnabled) {
            tooltip += `\nStatus: Disabled`;
            tooltip += `\nClick enable icon to re-enable`;
        } else {
            tooltip += `\nClick disable icon to disable project`;
        }

        item.tooltip = tooltip;

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