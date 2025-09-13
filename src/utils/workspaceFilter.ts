// src/utils/workspaceFilter.ts - Fixed version
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

export class WorkspaceFilter {
    private static readonly FILTERED_FILES_KEY = 'files.exclude';
    private originalExcludes: any = {};
    private isFiltering = false;
    private selectedProjectPaths: string[] = []; // Track which folders are selected as projects

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

            // Create exclude pattern
            const activeProjectName = path.basename(activeProjectPath);
            const excludePatterns: any = { ...this.originalExcludes };

            // Hide ALL directories except the active project
            for (const dirName of allSubdirectories) {
                if (dirName !== activeProjectName) {
                    excludePatterns[dirName] = true;
                }
            }

            // Apply the filter
            const config = vscode.workspace.getConfiguration();
            await config.update(WorkspaceFilter.FILTERED_FILES_KEY, excludePatterns, vscode.ConfigurationTarget.Workspace);

            this.isFiltering = true;
            Logger.info(`Applied project filtering, showing only: ${activeProjectName}`);

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
            Logger.info('Disabled project filtering, restored all folders');

        } catch (error) {
            Logger.error('Failed to disable project filtering', error);
            throw error;
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
            this.isFiltering = false;
            this.selectedProjectPaths = [];
            Logger.info('Restored original file excludes configuration');
        }
    }

    // Get status info for UI display
    getFilteringStatus(): { isFiltering: boolean; activeProject?: string } {
        return {
            isFiltering: this.isFiltering,
            activeProject: this.isFiltering ? 'Current project only' : undefined
        };
    }
}