// src/commands/index.ts - Updated to handle OptimizedSessionManager
import * as vscode from 'vscode';
import { ProjectTreeDataProvider } from '../providers/projectTreeDataProvider';
import { AllProjectsTreeDataProvider } from '../providers/allProjectsTreeDataProvider';
import { OptimizedSessionManager } from '../utils/optimizedSessionManager';
import { registerProjectCommands } from './projectCommands';
import { registerDebugCommands } from './debugCommands';
import { Logger } from '../utils/logger';

export function registerAllCommands(
    context: vscode.ExtensionContext,
    projectTreeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager, // Updated type
    allProjectsTreeDataProvider?: AllProjectsTreeDataProvider
) {
    Logger.info('=== Registering all commands with optimized session manager ===');

    // Register main project commands with optimized session manager
    registerProjectCommands(context, projectTreeDataProvider, sessionManager);

    // Register debug commands
    registerDebugCommands(context);

    // Register command to refresh both tree providers
    const refreshAllTrees = vscode.commands.registerCommand('project-switcher.refreshAllTrees', () => {
        Logger.debug('Refreshing both tree providers...');
        projectTreeDataProvider.refresh();
        if (allProjectsTreeDataProvider) {
            allProjectsTreeDataProvider.refresh();
        }
        Logger.debug('Tree providers refreshed');
    });

    context.subscriptions.push(refreshAllTrees);
    Logger.info(`Total commands registered with optimizations. Context subscriptions: ${context.subscriptions.length}`);
}