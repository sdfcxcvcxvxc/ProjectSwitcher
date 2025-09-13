// src/utils/workspaceFilter.ts - Fixed version with proper filtering
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

export class WorkspaceFilter {
    private static readonly FILTERED_FILES_KEY = 'files.exclude';
    private originalExcludes: any = {};
    private isFiltering = false;
    private selectedProjectPaths: string[] = [];
    private currentActiveProject: string | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.loadOriginalExcludes();
    }

    private loadOriginalExcludes() {
        // Load stored original excludes if available
        const stored = this.context.workspaceState.get<any>('originalFileExcludes');
        if (stored) {
            this.originalExcludes = stored;
        } else {
            // Get current configuration as original
            const config = vscode.workspace.getConfiguration();
            this.originalExcludes = config.get(WorkspaceFilter.FILTERED_FILES_KEY) || {};
        }

        // Load selected project paths
        const storedPaths = this.context.workspaceState.get<string[]>('selectedProjectPaths');
        if (storedPaths) {
            this.selectedProjectPaths = storedPaths;
        }

        // Load current filtering state
        const storedFilterState = this.context.workspaceState.get<boolean>('isCurrentlyFiltering');
        if (storedFilterState !== undefined) {
            this.isFiltering = storedFilterState;
        }

        // Load active project
        const storedActiveProject = this.context.workspaceState.get<string>('currentActiveProject');
        if (storedActiveProject) {
            this.currentActiveProject = storedActiveProject;
        }
    }

    // Store which folders were selected as projects
    async setSelectedProjects(projectPaths: string[]): Promise<void> {
        this.selectedProjectPaths = projectPaths;
        await this.context.workspaceState.update('selectedProjectPaths', projectPaths);
        Logger.debug(`Stored ${projectPaths.length} selected project paths`);
    }

    async enableProjectFiltering(activeProjectPath: string): Promise<void> {
        if (!vscode.workspace.workspaceFolders?.length) return;

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        this.currentActiveProject = activeProjectPath;

        try {
            // Get all subdirectories in workspace
            const entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });

            const allSubdirectories = entries
                .filter(entry =>
                    entry.isDirectory() &&
                    !entry.name.startsWith('.') &&
                    entry.name !== 'node_modules'
                )
                .map(entry => entry.name);

            // Create exclude pattern - start with original excludes
            const excludePatterns: any = { ...this.originalExcludes };

            // Get active project name
            const activeProjectName = path.basename(activeProjectPath);

            // Only hide directories that are NOT the active project
            // AND were not selected as projects (if user only selected 2 out of 3 folders)
            for (const dirName of allSubdirectories) {
                if (dirName !== activeProjectName) {
                    // Check if this directory was selected as a project
                    const dirPath = path.join(workspaceRoot, dirName);
                    const wasSelectedAsProject = this.selectedProjectPaths.some(
                        projectPath => path.basename(projectPath) === dirName
                    );

                    // If it wasn't selected as project, hide it when filtering is enabled
                    if (!wasSelectedAsProject) {
                        excludePatterns[dirName] = true;
                    } else {
                        // If it was selected as project but not active, hide it too
                        excludePatterns[dirName] = true;
                    }
                }
            }

            // Apply the filter
            const config = vscode.workspace.getConfiguration();
            await config.update(WorkspaceFilter.FILTERED_FILES_KEY, excludePatterns, vscode.ConfigurationTarget.Workspace);

            this.isFiltering = true;
            await this.context.workspaceState.update('isCurrentlyFiltering', true);
            await this.context.workspaceState.update('currentActiveProject', activeProjectPath);

            Logger.info(`Applied project filtering, showing only: ${activeProjectName}`);

            // Close tabs that don't belong to current project
            await this.closeTabsOutsideProject(activeProjectPath);

        } catch (error) {
            Logger.error('Failed to enable project filtering', error);
            throw error;
        }
    }

    async disableProjectFiltering(): Promise<void> {
        if (!this.isFiltering) return;

        try {
            const config = vscode.workspace.getConfiguration();
            await config.update(WorkspaceFilter.FILTERED_FILES_KEY, this.originalExcludes, vscode.ConfigurationTarget.Workspace);

            this.isFiltering = false;
            this.currentActiveProject = undefined;
            await this.context.workspaceState.update('isCurrentlyFiltering', false);
            await this.context.workspaceState.update('currentActiveProject', undefined);

            Logger.info('Disabled project filtering, restored all folders');

        } catch (error) {
            Logger.error('Failed to disable project filtering', error);
            throw error;
        }
    }

    private async closeTabsOutsideProject(activeProjectPath: string): Promise<void> {
        try {
            // Wait a bit for any pending tab operations to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            const tabGroups = vscode.window.tabGroups.all;
            const tabsToClose: vscode.Tab[] = [];

            for (const tabGroup of tabGroups) {
                for (const tab of tabGroup.tabs) {
                    if (tab.input instanceof vscode.TabInputText) {
                        const tabPath = tab.input.uri.fsPath;

                        // If tab is not within the active project directory, mark for closing
                        if (!tabPath.startsWith(activeProjectPath)) {
                            // Also verify it's within workspace
                            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            if (workspaceRoot && tabPath.startsWith(workspaceRoot)) {
                                tabsToClose.push(tab);
                            }
                        }
                    }
                }
            }

            // Close tabs in smaller batches to avoid issues
            if (tabsToClose.length > 0) {
                const batchSize = 5;
                for (let i = 0; i < tabsToClose.length; i += batchSize) {
                    const batch = tabsToClose.slice(i, i + batchSize);
                    await vscode.window.tabGroups.close(batch);
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                Logger.debug(`Closed ${tabsToClose.length} tabs outside active project`);
            }

        } catch (error) {
            Logger.warn('Failed to close tabs outside project', error);
        }
    }

    isCurrentlyFiltering(): boolean {
        return this.isFiltering;
    }

    // Method to update filtering when switching projects
    async updateProjectFilter(newActiveProjectPath: string): Promise<void> {
        if (this.isFiltering) {
            await this.enableProjectFiltering(newActiveProjectPath);
        }
    }

    // Store original excludes when Project Switcher is first enabled
    async storeOriginalConfiguration(): Promise<void> {
        const stored = this.context.workspaceState.get<any>('originalFileExcludes');
        if (!stored) {
            const config = vscode.workspace.getConfiguration();
            const currentExcludes = config.get(WorkspaceFilter.FILTERED_FILES_KEY) || {};
            await this.context.workspaceState.update('originalFileExcludes', currentExcludes);
            this.originalExcludes = currentExcludes;
            Logger.debug('Stored original file excludes configuration');
        } else {
            this.originalExcludes = stored;
        }
    }

    // Restore original configuration when Project Switcher is disabled
    async restoreOriginalConfiguration(): Promise<void> {
        const stored = this.context.workspaceState.get<any>('originalFileExcludes');
        if (stored) {
            const config = vscode.workspace.getConfiguration();
            await config.update(WorkspaceFilter.FILTERED_FILES_KEY, stored, vscode.ConfigurationTarget.Workspace);
            await this.context.workspaceState.update('originalFileExcludes', undefined);
            await this.context.workspaceState.update('selectedProjectPaths', undefined);
            await this.context.workspaceState.update('isCurrentlyFiltering', undefined);
            await this.context.workspaceState.update('currentActiveProject', undefined);
            this.isFiltering = false;
            this.selectedProjectPaths = [];
            this.currentActiveProject = undefined;
            Logger.info('Restored original file excludes configuration');
        }
    }

    // Get status info for UI display
    getFilteringStatus(): { isFiltering: boolean; activeProject?: string } {
        return {
            isFiltering: this.isFiltering,
            activeProject: this.currentActiveProject ? path.basename(this.currentActiveProject) : undefined
        };
    }

    // Method to restore filtering state on extension restart
    async restoreFilteringState(): Promise<void> {
        if (this.isFiltering && this.currentActiveProject) {
            await this.enableProjectFiltering(this.currentActiveProject);
        }
    }
}