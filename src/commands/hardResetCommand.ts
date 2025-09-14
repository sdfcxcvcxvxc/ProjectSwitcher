// src/commands/hardResetCommand.ts - Complete extension data reset
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { state } from '../models/models';
import { Logger } from '../utils/logger';

export function registerHardResetCommand(context: vscode.ExtensionContext, treeDataProvider: any) {
    const hardResetCommand = vscode.commands.registerCommand('project-switcher.hardReset', async () => {
        await performHardReset(context, treeDataProvider);
    });

    context.subscriptions.push(hardResetCommand);
    Logger.info('Hard Reset command registered');
}

async function performHardReset(context: vscode.ExtensionContext, treeDataProvider: any) {
    // Show warning dialog with detailed information
    const warningMessage = `⚠️ HARD RESET WARNING ⚠️

This will completely reset Project Switcher and:

🗑️ Clear ALL project configurations
🗑️ Delete ALL saved sessions and tabs
🗑️ Remove workspace filtering settings
🗑️ Reset .vscode/settings.json file excludes
🗑️ Clear all extension global state
🗑️ Reset all extension contexts

This action CANNOT be undone!

Current state:
• ${state.projects.length} projects configured
• ${state.sessions.size} sessions saved
• Workspace filtering: ${state.isProjectFilteringEnabled ? 'Enabled' : 'Disabled'}

Only use this if the extension is in an error state.`;

    const selection = await vscode.window.showWarningMessage(
        warningMessage,
        { modal: true },
        'HARD RESET - DELETE ALL',
        'Cancel'
    );

    if (selection !== 'HARD RESET - DELETE ALL') {
        Logger.info('Hard reset cancelled by user');
        return;
    }

    // Final confirmation
    const finalConfirm = await vscode.window.showWarningMessage(
        'Last chance: Are you absolutely sure you want to delete ALL Project Switcher data?',
        { modal: true },
        'YES, DELETE EVERYTHING',
        'Cancel'
    );

    if (finalConfirm !== 'YES, DELETE EVERYTHING') {
        Logger.info('Hard reset cancelled at final confirmation');
        return;
    }

    try {
        Logger.warn('Starting HARD RESET - all data will be deleted');

        // Show progress during reset
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Hard Reset in Progress',
            cancellable: false
        }, async (progress) => {

            progress.report({ message: 'Closing all editors...' });
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await new Promise(resolve => setTimeout(resolve, 500));

            progress.report({ message: 'Restoring workspace configuration...' });
            await resetWorkspaceSettings();

            progress.report({ message: 'Clearing extension global state...' });
            await clearGlobalState(context);

            progress.report({ message: 'Resetting workspace state...' });
            await clearWorkspaceState(context);

            progress.report({ message: 'Clearing in-memory state...' });
            clearInMemoryState();

            progress.report({ message: 'Resetting VS Code contexts...' });
            await resetVSCodeContexts();

            progress.report({ message: 'Refreshing file explorer...' });
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

            progress.report({ message: 'Finalizing reset...' });
            treeDataProvider.refresh();

            await new Promise(resolve => setTimeout(resolve, 1000));
        });

        // Show success message
        vscode.window.showInformationMessage(
            '✅ Hard Reset Complete!\n\nProject Switcher has been completely reset. All project data, sessions, and workspace settings have been cleared.',
            'Reload Window'
        ).then(selection => {
            if (selection === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });

        Logger.warn('HARD RESET completed successfully - all extension data cleared');

    } catch (error: any) {
        Logger.error('Hard reset failed', error);
        vscode.window.showErrorMessage(`Hard reset failed: ${error.message}\n\nTry reloading the window manually.`);
    }
}

async function resetWorkspaceSettings() {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            Logger.debug('No workspace folder found, skipping settings reset');
            return;
        }

        const settingsPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'settings.json');

        // Check if settings.json exists
        try {
            await fs.promises.access(settingsPath);
        } catch {
            Logger.debug('No .vscode/settings.json found, nothing to reset');
            return;
        }

        // Read current settings
        const settingsContent = await fs.promises.readFile(settingsPath, 'utf8');
        let settings: any;

        try {
            settings = JSON.parse(settingsContent);
        } catch (parseError) {
            Logger.warn('Could not parse settings.json, creating new one');
            settings = {};
        }

        // Remove files.exclude completely (reset to default VS Code behavior)
        if (settings['files.exclude']) {
            delete settings['files.exclude'];
            Logger.info('Removed files.exclude from workspace settings');
        }

        // If settings object is now empty, remove the file entirely
        if (Object.keys(settings).length === 0) {
            await fs.promises.unlink(settingsPath);
            Logger.info('Removed empty .vscode/settings.json file');

            // Also try to remove .vscode directory if it's empty
            try {
                const vscodeDir = path.dirname(settingsPath);
                const dirContents = await fs.promises.readdir(vscodeDir);
                if (dirContents.length === 0) {
                    await fs.promises.rmdir(vscodeDir);
                    Logger.info('Removed empty .vscode directory');
                }
            } catch {
                // Directory not empty or other error, ignore
            }
        } else {
            // Write back the cleaned settings
            await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 4), 'utf8');
            Logger.info('Updated .vscode/settings.json with cleaned settings');
        }

        // Force VS Code to reload configuration
        const config = vscode.workspace.getConfiguration();
        await config.update('files.exclude', undefined, vscode.ConfigurationTarget.Workspace);

    } catch (error) {
        Logger.error('Failed to reset workspace settings', error);
        // Don't throw - continue with reset
    }
}

async function clearGlobalState(context: vscode.ExtensionContext) {
    try {
        // Clear all project-switcher related global state keys
        const keysToDelete = [
            'projects',
            'projectSessions',
            'projectSwitcherEnabled',
            'currentProjectId',
            'extensionVersion'
        ];

        for (const key of keysToDelete) {
            await context.globalState.update(key, undefined);
        }

        Logger.info('Cleared all global state data');
    } catch (error) {
        Logger.error('Failed to clear global state', error);
    }
}

async function clearWorkspaceState(context: vscode.ExtensionContext) {
    try {
        // Clear all workspace state keys
        const keysToDelete = [
            'originalFileExcludes',
            'selectedProjectPaths',
            'isCurrentlyFiltering',
            'currentActiveProject',
            'workspaceMode',
            'lastKnownProjects'
        ];

        for (const key of keysToDelete) {
            await context.workspaceState.update(key, undefined);
        }

        Logger.info('Cleared all workspace state data');
    } catch (error) {
        Logger.error('Failed to clear workspace state', error);
    }
}

function clearInMemoryState() {
    try {
        // Dispose session manager if it exists
        if (state.sessionManager && typeof state.sessionManager.dispose === 'function') {
            state.sessionManager.dispose();
        }

        // Clear all in-memory state
        state.projects.length = 0;
        state.sessions.clear();
        state.currentProjectId = undefined;
        state.isProjectSwitcherEnabled = false;
        state.isProjectFilteringEnabled = false;
        state.isInitialized = false;
        state.workspaceFilter = undefined;
        state.sessionManager = undefined;

        Logger.info('Cleared all in-memory state');
    } catch (error) {
        Logger.error('Failed to clear in-memory state', error);
    }
}

async function resetVSCodeContexts() {
    try {
        // Reset all VS Code contexts used by the extension
        await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', false);
        await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects', false);
        await vscode.commands.executeCommand('setContext', 'projectSwitcher.canDisableProjects', false);

        Logger.info('Reset all VS Code contexts');
    } catch (error) {
        Logger.error('Failed to reset VS Code contexts', error);
    }
}