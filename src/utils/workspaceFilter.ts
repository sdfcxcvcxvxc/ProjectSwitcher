// src/utils/workspaceFilter.ts - Fixed disable handling to show all folders
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

            // Hide all directories except the active project
            for (const dirName of allSubdirectories) {
                if (dirName !== activeProjectName) {
                    excludePatterns[dirName] = true;
                }
            }

            // Apply the filter
            const config = vscode.workspace.getConfiguration();
            await config.update(WorkspaceFilter.FILTERED_FILES_KEY, excludePatterns, vscode.ConfigurationTarget.Workspace);

            this.isFiltering = true;
            await this.context.workspaceState.update('isCurrentlyFiltering', true);
            await this.context.workspaceState.update('currentActiveProject', activeProjectPath);

            Logger.info(`Applied project filtering, showing only: ${activeProjectName}`);

        } catch (error) {
            Logger.error('Failed to enable project filtering', error);
            throw error;
        }
    }

    async disableProjectFiltering(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration();
            // FIXED: Always restore to original excludes to show ALL folders
            await config.update(WorkspaceFilter.FILTERED_FILES_KEY, this.originalExcludes, vscode.ConfigurationTarget.Workspace);

            this.isFiltering = false;
            this.currentActiveProject = undefined;
            await this.context.workspaceState.update('isCurrentlyFiltering', false);
            await this.context.workspaceState.update('currentActiveProject', undefined);

            Logger.info('Disabled project filtering, restored ALL folders');

            // Force refresh explorer to show all folders
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

        } catch (error) {
            Logger.error('Failed to disable project filtering', error);
            throw error;
        }
    }

    isCurrentlyFiltering(): boolean {
        return this.isFiltering;
    }

    async updateProjectFilter(newActiveProjectPath: string): Promise<void> {
        if (this.isFiltering) {
            await this.enableProjectFiltering(newActiveProjectPath);
        }
    }

    // Store original configuration properly
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

    // FIXED: Properly restore original configuration and show ALL folders
    async restoreOriginalConfiguration(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration();

            // CRITICAL FIX: Always restore to the original excludes to show ALL folders
            await config.update(WorkspaceFilter.FILTERED_FILES_KEY, this.originalExcludes, vscode.ConfigurationTarget.Workspace);

            // Clear workspace state
            await this.context.workspaceState.update('originalFileExcludes', undefined);
            await this.context.workspaceState.update('selectedProjectPaths', undefined);
            await this.context.workspaceState.update('isCurrentlyFiltering', undefined);
            await this.context.workspaceState.update('currentActiveProject', undefined);

            // Reset instance variables
            this.isFiltering = false;
            this.selectedProjectPaths = [];
            this.currentActiveProject = undefined;

            // Force refresh explorer to ensure all folders show
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

            Logger.info('Restored original file excludes - ALL folders should now be visible');

        } catch (error) {
            Logger.error('Failed to restore original configuration', error);
        }
    }

    getFilteringStatus(): { isFiltering: boolean; activeProject?: string } {
        return {
            isFiltering: this.isFiltering,
            activeProject: this.currentActiveProject ? path.basename(this.currentActiveProject) : undefined
        };
    }

    async restoreFilteringState(): Promise<void> {
        if (this.isFiltering && this.currentActiveProject) {
            await this.enableProjectFiltering(this.currentActiveProject);
        }
    }
}