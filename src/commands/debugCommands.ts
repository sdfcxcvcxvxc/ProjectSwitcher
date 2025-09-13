// src/commands/debugCommands.ts - Debug commands for activity bar
import * as vscode from 'vscode';
import { state } from '../models/models';
import { Logger } from '../utils/logger';

export function registerDebugCommands(context: vscode.ExtensionContext) {
    // Debug: Show extension state
    const debugStateCommand = vscode.commands.registerCommand('project-switcher.debugState', async () => {
        const stateInfo = {
            projects: state.projects.length,
            currentProjectId: state.currentProjectId,
            workspaceMode: state.workspaceMode,
            isProjectSwitcherEnabled: state.isProjectSwitcherEnabled,
            isProjectFilteringEnabled: state.isProjectFilteringEnabled,
            isInitialized: state.isInitialized,
            hasStatusBarItem: !!state.statusBarItem,
            hasSessionManager: !!state.sessionManager,
            hasWorkspaceFilter: !!state.workspaceFilter,
            sessionsCount: state.sessions.size,
            extensionId: context.extension.id,
            extensionPath: context.extension.extensionPath,
            subscriptionsCount: context.subscriptions.length
        };

        Logger.info('Extension State:', stateInfo);
        vscode.window.showInformationMessage(`Extension State: ${JSON.stringify(stateInfo, null, 2)}`);
    });

    // Debug: Check VS Code contexts
    const debugContextCommand = vscode.commands.registerCommand('project-switcher.debugContext', async () => {
        try {
            // Check if our context is set
            const commands = await vscode.commands.getCommands(true);
            const projectSwitcherCommands = commands.filter(cmd => cmd.startsWith('project-switcher'));

            Logger.info(`Found ${projectSwitcherCommands.length} project-switcher commands`);
            Logger.info('Commands:', projectSwitcherCommands);

            // Try to get extension info
            const extensions = vscode.extensions.all.filter(ext => ext.id.includes('project'));
            const extensionInfo = extensions.map(ext => ({
                id: ext.id,
                isActive: ext.isActive,
                packageJSON: ext.packageJSON.displayName
            }));

            Logger.info('Project-related extensions:', extensionInfo);

            vscode.window.showInformationMessage(
                `Commands: ${projectSwitcherCommands.length}, Extensions: ${extensionInfo.length}`
            );

        } catch (error) {
            Logger.error('Error checking contexts', error);
            vscode.window.showErrorMessage('Error checking contexts: ' + error);
        }
    });

    // Debug: Test activity bar visibility
    const debugActivityBarCommand = vscode.commands.registerCommand('project-switcher.debugActivityBar', async () => {
        try {
            Logger.info('Testing activity bar...');

            // Try to explicitly show our view container
            await vscode.commands.executeCommand('workbench.view.extension.project-switcher');

            // Check if view containers are registered
            const viewContainers = vscode.extensions.all
                .map(ext => ext.packageJSON?.contributes?.viewsContainers?.activitybar)
                .filter(Boolean)
                .flat()
                .filter(container => container?.id?.includes('project'));

            Logger.info('Project view containers:', viewContainers);

            // Try to focus our specific view
            setTimeout(async () => {
                try {
                    await vscode.commands.executeCommand('projectManager.focus');
                    Logger.info('Successfully focused projectManager view');
                } catch (error) {
                    Logger.warn('Failed to focus projectManager view', error);
                }
            }, 1000);

            // Check workspace folders
            const workspaceFolders = vscode.workspace.workspaceFolders;
            Logger.info('Workspace folders:', workspaceFolders?.map(f => f.uri.fsPath));

            vscode.window.showInformationMessage('Activity bar debug completed - check output panel');

        } catch (error) {
            Logger.error('Error debugging activity bar', error);
            vscode.window.showErrorMessage('Error debugging activity bar: ' + error);
        }
    });

    // Debug: List all registered commands
    const debugCommandsCommand = vscode.commands.registerCommand('project-switcher.debugCommands', async () => {
        try {
            const allCommands = await vscode.commands.getCommands(true);
            const projectCommands = allCommands.filter(cmd => cmd.includes('project'));

            Logger.info(`Total commands: ${allCommands.length}`);
            Logger.info(`Project-related commands: ${projectCommands.length}`);
            Logger.info('Project commands:', projectCommands);

            // Check our specific commands
            const ourCommands = [
                'project-switcher.showProjectMenu',
                'project-switcher.toggleMode',
                'project-switcher.toggleFiltering',
                'project-switcher.openProjectSwitchMenu'
            ];

            const commandStatus = ourCommands.map(cmd => ({
                command: cmd,
                registered: allCommands.includes(cmd)
            }));

            Logger.info('Our commands status:', commandStatus);

            vscode.window.showInformationMessage(
                `Found ${projectCommands.length} project commands. Check output panel for details.`
            );

        } catch (error) {
            Logger.error('Error listing commands', error);
            vscode.window.showErrorMessage('Error listing commands: ' + error);
        }
    });

    context.subscriptions.push(
        debugStateCommand,
        debugContextCommand,
        debugActivityBarCommand,
        debugCommandsCommand
    );

    Logger.info('Debug commands registered successfully');
}