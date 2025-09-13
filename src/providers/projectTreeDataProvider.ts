// src/providers/projectTreeDataProvider.ts - Updated to show helpful messages
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
            // Root level - check if Project Switcher is enabled
            if (!state.isProjectSwitcherEnabled) {
                return this.getDisabledModeItems();
            }

            // Project Switcher is enabled - show all projects sorted by order
            const sortedProjects = [...state.projects].sort((a, b) => a.order - b.order);

            if (sortedProjects.length === 0) {
                const item = new vscode.TreeItem('No projects configured') as ProjectTreeItem;
                item.description = 'Enable Project Switcher first';
                item.projectId = '';
                item.project = {} as ProjectConfig;
                return Promise.resolve([item]);
            }

            return Promise.resolve(sortedProjects.map(project => this.createProjectTreeItem(project)));
        }

        return Promise.resolve([]);
    }

    private getDisabledModeItems(): Promise<ProjectTreeItem[]> {
        const items: ProjectTreeItem[] = [];

        if (state.workspaceMode === WorkspaceMode.ParentDirectory) {
            // Parent directory detected - show enable option
            const enableItem = new vscode.TreeItem('Enable Project Switcher') as ProjectTreeItem;
            enableItem.description = 'Manage subdirectories as separate projects';
            enableItem.iconPath = new vscode.ThemeIcon('folder-library', new vscode.ThemeColor('terminal.ansiGreen'));
            enableItem.tooltip = 'Click to enable Project Switcher for this workspace';
            enableItem.command = {
                command: 'project-switcher.toggleMode',
                title: 'Enable Project Switcher'
            };
            enableItem.projectId = '';
            enableItem.project = {} as ProjectConfig;
            items.push(enableItem);

            // Show workspace info
            const infoItem = new vscode.TreeItem('Multi-folder workspace detected') as ProjectTreeItem;
            infoItem.description = 'Click above to organize';
            infoItem.iconPath = new vscode.ThemeIcon('info');
            infoItem.projectId = '';
            infoItem.project = {} as ProjectConfig;
            items.push(infoItem);

        } else if (state.workspaceMode === WorkspaceMode.SingleProject) {
            // Single project workspace
            const infoItem = new vscode.TreeItem('Single project workspace') as ProjectTreeItem;
            infoItem.description = 'Project Switcher not needed';
            infoItem.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('terminal.ansiBlue'));
            infoItem.tooltip = 'This workspace contains a single project. Project Switcher is designed for parent directories with multiple project folders.';
            infoItem.projectId = '';
            infoItem.project = {} as ProjectConfig;
            items.push(infoItem);

        } else {
            // No workspace
            const noWorkspaceItem = new vscode.TreeItem('No workspace open') as ProjectTreeItem;
            noWorkspaceItem.description = 'Open a folder first';
            noWorkspaceItem.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('terminal.ansiYellow'));
            noWorkspaceItem.projectId = '';
            noWorkspaceItem.project = {} as ProjectConfig;
            items.push(noWorkspaceItem);
        }

        return Promise.resolve(items);
    }

    private createProjectTreeItem(project: ProjectConfig): ProjectTreeItem {
        const isCurrentProject = project.id === state.currentProjectId;
        const sessionEnabled = project.sessionEnabled !== false; // Default to enabled
        const hasSession = state.sessions.has(project.id);

        const projectName = `[${project.order}] ${project.name}`;

        const item = new vscode.TreeItem(
            projectName,
            vscode.TreeItemCollapsibleState.None
        ) as ProjectTreeItem;

        item.projectId = project.id;
        item.project = project;
        item.contextValue = 'project';

        // Show current project with different styling
        if (isCurrentProject) {
            item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
            let description = '(active)';

            // Add session status to active project
            if (sessionEnabled) {
                description += hasSession ? ' • session saved' : ' • session enabled';
            } else {
                description += ' • session disabled';
            }

            // Add filtering status to active project
            if (state.workspaceFilter?.isCurrentlyFiltering()) {
                description += ' • filtered';
            }

            item.description = description;
        } else {
            item.iconPath = new vscode.ThemeIcon('circle-outline');

            // Show session status for non-active projects
            let description = '';
            if (sessionEnabled && hasSession) {
                description = '• session saved';
            } else if (!sessionEnabled) {
                description = '• session disabled';
            }
            item.description = description;
        }

        // Enhanced tooltip with session information
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

        // Add filtering status to tooltip
        if (isCurrentProject && state.workspaceFilter) {
            const filterStatus = state.workspaceFilter.isCurrentlyFiltering() ?
                'Active (showing only this project)' :
                'Disabled (showing all folders)';
            tooltip += `\nFiltering: ${filterStatus}`;
        }

        tooltip += `\nShortcut: Ctrl+Alt+${project.order}`;

        item.tooltip = tooltip;

        // Add command to switch project on click
        item.command = {
            command: 'project-switcher.switchProject',
            title: 'Switch to Project',
            arguments: [item]
        };

        return item;
    }
}