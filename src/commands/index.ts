// src/commands/index.ts - Updated to handle both tree providers and debug commands
import * as vscode from 'vscode';
import { ProjectTreeDataProvider } from '../providers/projectTreeDataProvider';
import { AllProjectsTreeDataProvider } from '../providers/allProjectsTreeDataProvider';
import { SessionManager } from '../utils/sessionManager';
import { registerProjectCommands } from './projectCommands';
import { registerDebugCommands } from './debugCommands';
import { Logger } from '../utils/logger';

export function registerAllCommands(
    context: vscode.ExtensionContext,
    projectTreeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager,
    allProjectsTreeDataProvider?: AllProjectsTreeDataProvider
) {
    Logger.info('=== Registering all commands ===');

    // Register main project commands
    registerProjectCommands(context, projectTreeDataProvider, sessionManager);

    // Register debug commands (always available)
    registerDebugCommands(context);

    // Register command to refresh both tree providers when projects change
    const refreshAllTrees = vscode.commands.registerCommand('project-switcher.refreshAllTrees', () => {
        Logger.debug('Refreshing both tree providers...');
        projectTreeDataProvider.refresh();
        if (allProjectsTreeDataProvider) {
            allProjectsTreeDataProvider.refresh();
        }
        Logger.debug('Tree providers refreshed');
    });

    context.subscriptions.push(refreshAllTrees);
    Logger.info(`Total commands registered. Context subscriptions: ${context.subscriptions.length}`);
}