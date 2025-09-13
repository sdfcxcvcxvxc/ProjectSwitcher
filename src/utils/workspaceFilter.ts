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

            // FIXED: Start fresh with original excludes instead of accumulating
            const excludePatterns: any = { ...this.originalExcludes };

            // Get active project name
            const activeProjectName = path.basename(activeProjectPath);

            // FIXED: Remove any previously excluded project folders first
            for (const dirName of allSubdirectories) {
                // Remove the directory from excludes if it was previously hidden
                if (excludePatterns[dirName] === true) {
                    delete excludePatterns[dirName];
                }
            }

            // Now hide all directories except the active project
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

            // Log current state before disabling
            const currentExcludes = config.get(WorkspaceFilter.FILTERED_FILES_KEY) || {};
            Logger.info('Current excludes before disabling filtering:', currentExcludes);
            Logger.info('Original excludes to restore:', this.originalExcludes);

            // FIXED: Always restore to original excludes to show ALL folders
            await config.update(
                WorkspaceFilter.FILTERED_FILES_KEY,
                this.originalExcludes,
                vscode.ConfigurationTarget.Workspace
            );

            // Update internal state
            this.isFiltering = false;
            this.currentActiveProject = undefined;

            // Update workspace state
            await this.context.workspaceState.update('isCurrentlyFiltering', false);
            await this.context.workspaceState.update('currentActiveProject', undefined);

            // Verify the change was applied
            const verifyConfig = vscode.workspace.getConfiguration();
            const verifyExcludes = verifyConfig.get(WorkspaceFilter.FILTERED_FILES_KEY);
            Logger.info('Verified excludes after disabling filtering:', verifyExcludes);

            Logger.info('Disabled project filtering, restored ALL folders');

            // Force refresh explorer to show all folders - multiple attempts
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

            // Second refresh after delay to ensure visibility
            setTimeout(async () => {
                await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
                Logger.info('Secondary explorer refresh completed');
            }, 300);

            // Third refresh after longer delay as final guarantee
            setTimeout(async () => {
                await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
                Logger.info('Final explorer refresh completed');
            }, 1000);

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

            // Get current excludes to compare
            const currentExcludes = config.get(WorkspaceFilter.FILTERED_FILES_KEY) || {};
            Logger.info('Current excludes before restore:', currentExcludes);
            Logger.info('Original excludes to restore:', this.originalExcludes);

            // CRITICAL FIX: Always restore to the original excludes to show ALL folders
            await config.update(
                WorkspaceFilter.FILTERED_FILES_KEY,
                this.originalExcludes,
                vscode.ConfigurationTarget.Workspace
            );

            // Verify the configuration was applied
            const updatedConfig = vscode.workspace.getConfiguration();
            const verifyExcludes = updatedConfig.get(WorkspaceFilter.FILTERED_FILES_KEY);
            Logger.info('Verified excludes after restore:', verifyExcludes);

            // Clear workspace state
            await this.context.workspaceState.update('originalFileExcludes', undefined);
            await this.context.workspaceState.update('selectedProjectPaths', undefined);
            await this.context.workspaceState.update('isCurrentlyFiltering', undefined);
            await this.context.workspaceState.update('currentActiveProject', undefined);

            // Reset instance variables
            this.isFiltering = false;
            this.selectedProjectPaths = [];
            this.currentActiveProject = undefined;

            // Force multiple refreshes to ensure all folders show
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

            // Additional refresh after short delay
            setTimeout(async () => {
                await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
            }, 300);

            Logger.info('Restored original file excludes - ALL folders should now be visible');

        } catch (error) {
            Logger.error('Failed to restore original configuration', error);

            // Fallback: Try to manually clear workspace settings.json
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (workspaceFolder) {
                    const config = vscode.workspace.getConfiguration();
                    // Force clear with empty object and then restore original
                    await config.update(WorkspaceFilter.FILTERED_FILES_KEY, {}, vscode.ConfigurationTarget.Workspace);
                    setTimeout(async () => {
                        await config.update(WorkspaceFilter.FILTERED_FILES_KEY, this.originalExcludes, vscode.ConfigurationTarget.Workspace);
                        await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
                    }, 500);
                }
            } catch (fallbackError) {
                Logger.error('Fallback restore also failed', fallbackError);
            }
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