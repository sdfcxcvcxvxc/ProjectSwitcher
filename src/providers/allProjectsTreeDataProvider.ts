// src/providers/allProjectsTreeDataProvider.ts - New provider for Explorer sidebar
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectConfig, ProjectTreeItem } from '../models/models';

export class AllProjectsTreeDataProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
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
            // Root level - show all projects sorted by order, excluding current project
            const availableProjects = [...state.projects]
                .filter(project => project.id !== state.currentProjectId) // Exclude current project
                .sort((a, b) => a.order - b.order);

            if (availableProjects.length === 0) {
                const item = new vscode.TreeItem('No other projects') as ProjectTreeItem;
                item.description = state.currentProjectId ? 'Current project only' : 'No projects available';
                item.projectId = '';
                item.project = {} as ProjectConfig;
                return Promise.resolve([item]);
            }

            return Promise.resolve(availableProjects.map(project => this.createAllProjectTreeItem(project)));
        }

        return Promise.resolve([]);
    }

    private createAllProjectTreeItem(project: ProjectConfig): ProjectTreeItem {
        const sessionEnabled = project.sessionEnabled !== false; // Default to enabled
        const hasSession = state.sessions.has(project.id);

        const projectName = `[${project.order}] ${project.name}`;

        const item = new vscode.TreeItem(
            projectName,
            vscode.TreeItemCollapsibleState.None
        ) as ProjectTreeItem;

        item.projectId = project.id;
        item.project = project;
        item.contextValue = 'allProject'; // Different context value for different menu items

        // Use circle-outline icon for non-active projects
        item.iconPath = new vscode.ThemeIcon('circle-outline');

        // Show session status
        let description = '';
        if (sessionEnabled && hasSession) {
            description = '• session saved';
        } else if (!sessionEnabled) {
            description = '• session disabled';
        }
        item.description = description;

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
        tooltip += `\nClick to switch to this project`;

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