// src/providers/allProjectsTreeDataProvider.ts - Updated with dynamic order display
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectConfig, ProjectTreeItem } from '../models/models';
import { getEnabledProjectsWithDynamicOrder } from '../utils/projectUtils';

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
            // Root level - show enabled projects only, excluding current project
            const enabledProjects = getEnabledProjectsWithDynamicOrder()
                .filter(project => project.id !== state.currentProjectId);

            if (enabledProjects.length === 0) {
                const item = new vscode.TreeItem('No other enabled projects') as ProjectTreeItem;
                item.description = state.currentProjectId ? 'Current project only' : 'No enabled projects available';
                item.projectId = '';
                item.project = {} as ProjectConfig;
                return Promise.resolve([item]);
            }

            return Promise.resolve(enabledProjects.map((project, index) =>
                this.createAllProjectTreeItem(project, index + 1)
            ));
        }

        return Promise.resolve([]);
    }

    private createAllProjectTreeItem(project: ProjectConfig, dynamicOrder: number): ProjectTreeItem {
        const sessionEnabled = project.sessionEnabled !== false; // Default to enabled
        const hasSession = state.sessions.has(project.id);

        // Show dynamic order instead of original order
        const projectName = `[${dynamicOrder}] ${project.name}`;

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

        // Enhanced tooltip with dynamic order information
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

        tooltip += `\nShortcut: Ctrl+Alt+${dynamicOrder} (dynamic based on enabled projects)`;
        tooltip += `\nOriginal order: ${project.order}`;
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