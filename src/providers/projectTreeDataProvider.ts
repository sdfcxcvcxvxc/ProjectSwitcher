import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectConfig, ProjectTreeItem } from '../models/models';

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
            // Root level - show all projects sorted by order
            const sortedProjects = [...state.projects].sort((a, b) => a.order - b.order);

            if (sortedProjects.length === 0) {
                const item = new vscode.TreeItem('No projects configured') as ProjectTreeItem;
                item.description = 'Click + to add current workspace';
                item.projectId = '';
                item.project = {} as ProjectConfig;
                return Promise.resolve([item]);
            }

            return Promise.resolve(sortedProjects.map(project => this.createProjectTreeItem(project)));
        }

        return Promise.resolve([]);
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