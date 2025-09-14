// src/commands/projectCommands.ts - Complete implementation with optimized session management
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectTreeItem, ProjectConfig } from '../models/models';
import {
    updateProject,
    moveProject,
    saveProjects,
    getProjectById,
    getProjectByDynamicOrder,
    validateProjectPath,
    enableProjectSwitcherManually,
    disableProjectSwitcher,
    switchToProject
} from '../utils/projectUtils';
import { ProjectTreeDataProvider } from '../providers/projectTreeDataProvider';
import { OptimizedSessionManager } from '../utils/optimizedSessionManager';
import { Logger } from '../utils/logger';

// Import updateContexts function - this should be exported from extension.ts
let updateContexts: () => Promise<void>;

export function setUpdateContexts(updateContextsFunc: () => Promise<void>) {
    updateContexts = updateContextsFunc;
}

export function registerProjectCommands(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    Logger.info('=== Registering project commands with dynamic order and optimized session management ===');

    const commands = [
        // Core project management with optimized switching
        vscode.commands.registerCommand('project-switcher.switchProject', (item: ProjectTreeItem) =>
            switchProjectOptimized(item, context, treeDataProvider, sessionManager)),

        // Enable/disable commands
        vscode.commands.registerCommand('project-switcher.enableProject', (item: ProjectTreeItem) =>
            enableProject(item, context, treeDataProvider, sessionManager)),
        vscode.commands.registerCommand('project-switcher.disableProject', (item: ProjectTreeItem) =>
            disableProject(item, context, treeDataProvider, sessionManager)),

        // Session management
        vscode.commands.registerCommand('project-switcher.saveSession', (item: ProjectTreeItem) =>
            saveProjectSession(item, sessionManager)),
        vscode.commands.registerCommand('project-switcher.clearSession', (item: ProjectTreeItem) =>
            clearProjectSession(item, sessionManager, treeDataProvider)),

        // Project ordering
        vscode.commands.registerCommand('project-switcher.moveUp', (item: ProjectTreeItem) =>
            moveProjectUp(item, context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.moveDown', (item: ProjectTreeItem) =>
            moveProjectDown(item, context, treeDataProvider)),

        // UI commands
        vscode.commands.registerCommand('project-switcher.toggleMode', () =>
            toggleProjectSwitcherMode(context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.toggleFiltering', () =>
            toggleProjectFiltering(context, treeDataProvider)),

        // Enhanced project switch menu with performance indicator
        vscode.commands.registerCommand('project-switcher.openProjectSwitchMenu', () =>
            openOptimizedProjectSwitchMenu(context, treeDataProvider, sessionManager)),

        // Hard reset command
        vscode.commands.registerCommand('project-switcher.hardReset', () =>
            performHardReset(context, treeDataProvider)),

        // Cleanup workspace settings
        vscode.commands.registerCommand('project-switcher.cleanupSettings', () =>
            cleanupWorkspaceSettings(context, treeDataProvider)),

        // Extension removal warning command
        vscode.commands.registerCommand('project-switcher.showRemovalWarning', () => {
            const message = `🚨🚨 CRITICAL: EXTENSION REMOVAL WARNING 🚨🚨

BEFORE uninstalling Project Switcher extension, you MUST do ONE of these:

✅ OPTION 1 (Recommended):
   1. Click "Disable Project Switcher" button in the tree view above
   2. This will automatically clean up all workspace settings
   3. Then you can safely uninstall the extension

✅ OPTION 2 (Emergency):
   1. Click "Hard Reset (if has error)" button in the tree view above
   2. This will completely clean all extension data and settings
   3. Then you can safely uninstall the extension

✅ OPTION 3 (Manual):
   1. Open your workspace folder
   2. Navigate to .vscode/settings.json
   3. Remove the "files.exclude" section that was added by this extension
   4. Save the file

❌ WHAT HAPPENS IF YOU DON'T DO THIS:
   • Some project folders will remain permanently hidden
   • Your workspace .vscode/settings.json will keep the "files.exclude" settings
   • You'll have to manually edit settings.json to fix the issue
   • Other developers opening the workspace will also see hidden folders

🔧 TECHNICAL INFO:
This extension modifies your workspace's "files.exclude" setting to hide/show project folders. If you uninstall without cleaning up, these settings remain in your .vscode/settings.json file.

⚠️ ALWAYS CLEAN UP FIRST BEFORE UNINSTALLING!

Current extension state:
• Extension enabled: ${state.isProjectSwitcherEnabled ? 'Yes' : 'No'}
• Projects configured: ${state.projects.length}
• Workspace filtering active: ${state.isProjectFilteringEnabled ? 'Yes' : 'No'}`;

            vscode.window.showWarningMessage(
                message,
                { modal: true },
                'Open .vscode/settings.json',
                'Run Hard Reset Now',
                'Disable Extension Now',
                'I Understand'
            ).then(selection => {
                if (selection === 'Open .vscode/settings.json') {
                    // Try to open the workspace settings.json file
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (workspaceFolder) {
                        const settingsPath = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'settings.json');
                        vscode.workspace.openTextDocument(settingsPath).then(doc => {
                            vscode.window.showTextDocument(doc);
                        }, error => {
                            // Handle error case
                            vscode.window.showErrorMessage('Could not open .vscode/settings.json. The file may not exist yet.');
                        });
                    } else {
                        vscode.window.showErrorMessage('No workspace folder found.');
                    }
                } else if (selection === 'Run Hard Reset Now') {
                    vscode.commands.executeCommand('project-switcher.hardReset');
                } else if (selection === 'Disable Extension Now') {
                    vscode.commands.executeCommand('project-switcher.toggleMode');
                } else if (selection === 'I Understand') {
                    vscode.window.showInformationMessage(
                        'Great! Remember to clean up before uninstalling. You can always click the warning again if you need these instructions.'
                    );
                }
            });
        }),

        // Keyboard shortcut commands (1-9) with DYNAMIC ordering
        ...Array.from({ length: 9 }, (_, i) => {
            const dynamicOrder = i + 1;
            return vscode.commands.registerCommand(`project-switcher.switchToProject${dynamicOrder}`, () =>
                switchToProjectByDynamicOrder(dynamicOrder, context, treeDataProvider, sessionManager)
            );
        }),
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
    Logger.info(`Registered ${commands.length} optimized commands with dynamic ordering`);
}

// OPTIMIZED: Fast project switching with tab management
async function switchProjectOptimized(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project || project.enabled === false) {
        vscode.window.showWarningMessage(`Project "${project?.name || 'Unknown'}" is disabled`);
        return;
    }

    await performOptimizedProjectSwitch(project, context, treeDataProvider, sessionManager);
}

// DYNAMIC ORDER: Use dynamic order instead of static order
async function switchToProjectByDynamicOrder(
    dynamicOrder: number,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    const project = getProjectByDynamicOrder(dynamicOrder);
    if (!project) {
        vscode.window.showWarningMessage(`No enabled project at position ${dynamicOrder}`);
        return;
    }

    if (project.enabled === false) {
        vscode.window.showWarningMessage(`Project "${project.name}" is disabled`);
        return;
    }

    await performOptimizedProjectSwitch(project, context, treeDataProvider, sessionManager);
}

// Enhanced project switch menu with performance info
async function openOptimizedProjectSwitchMenu(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    if (!state.isProjectSwitcherEnabled) {
        vscode.window.showWarningMessage('Project Switcher is not enabled. Enable it first to use this feature.');
        return;
    }

    if (state.projects.length === 0) {
        vscode.window.showInformationMessage('No projects configured. Enable Project Switcher first.');
        return;
    }

    const availableProjects = [...state.projects]
        .filter(project => project.id !== state.currentProjectId && project.enabled !== false)
        .sort((a, b) => a.order - b.order);

    if (availableProjects.length === 0) {
        vscode.window.showInformationMessage('No other enabled projects available to switch to.');
        return;
    }

    // Enhanced items with dynamic order display
    const items = await Promise.all(availableProjects.map(async (project, index) => {
        const dynamicOrder = index + 1;
        const tabCount = await sessionManager.getProjectTabCount(project.id);
        const sessionInfo = project.sessionEnabled !== false ?
            (tabCount > 0 ? ` • ${tabCount} tabs (optimized)` : ' • session enabled') :
            ' • session disabled';

        // Performance indicator for large numbers of tabs
        const perfIndicator = tabCount > 50 ? ' ⚡' : tabCount > 20 ? ' 🔸' : '';

        return {
            label: `[${dynamicOrder}] ${project.name}${perfIndicator}`,
            description: project.path,
            detail: `${project.description || ''}${sessionInfo}`,
            project
        };
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select project to switch to (dynamic ordering - shortcuts adjust when projects are disabled)',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selection) {
        await performOptimizedProjectSwitch(selection.project, context, treeDataProvider, sessionManager);
    }
}

// CORE OPTIMIZED PROJECT SWITCHING LOGIC
async function performOptimizedProjectSwitch(
    project: ProjectConfig,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    const startTime = Date.now();

    try {
        Logger.info(`Starting optimized switch to project: ${project.name}`);

        // Check if project path still exists
        const pathExists = await validateProjectPath(project.path);
        if (!pathExists) {
            vscode.window.showErrorMessage(`Project path no longer exists: ${project.path}`);
            return;
        }

        // Show progress for projects with many tabs
        const currentTabCount = await sessionManager.getProjectTabCount(state.currentProjectId || '');
        const targetTabCount = await sessionManager.getProjectTabCount(project.id);

        const showProgress = currentTabCount > 20 || targetTabCount > 20;

        if (showProgress) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Switching to ${project.name}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Preparing workspace...' });

                // Step 1: Update filtering first (instant)
                if (state.workspaceFilter && state.isProjectSwitcherEnabled) {
                    await state.workspaceFilter.enableProjectFiltering(project.path);
                    state.isProjectFilteringEnabled = true;
                }

                progress.report({ message: 'Optimizing tabs...' });

                // Step 2: Use optimized session manager for tab switching
                const switchSuccess = await sessionManager.switchToProject(project.id);

                if (switchSuccess) {
                    progress.report({ message: 'Finalizing...' });

                    // Step 3: Update project state
                    project.lastUsed = Date.now();
                    saveProjects(context);

                    // Step 4: Focus project directory
                    const projectUri = vscode.Uri.file(project.path);
                    await vscode.commands.executeCommand('revealInExplorer', projectUri);
                    await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
                }

                return switchSuccess;
            });
        } else {
            // Fast switch for projects with few tabs
            // Step 1: Update filtering
            if (state.workspaceFilter && state.isProjectSwitcherEnabled) {
                await state.workspaceFilter.enableProjectFiltering(project.path);
                state.isProjectFilteringEnabled = true;
            }

            // Step 2: Optimized tab switching
            const switchSuccess = await sessionManager.switchToProject(project.id);

            if (switchSuccess) {
                // Step 3: Update project state
                project.lastUsed = Date.now();
                saveProjects(context);

                // Step 4: Focus project directory
                const projectUri = vscode.Uri.file(project.path);
                await vscode.commands.executeCommand('revealInExplorer', projectUri);
                await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
            }
        }

        // Update current project state
        state.currentProjectId = project.id;

        // Update UI contexts
        if (updateContexts) {
            await updateContexts();
        }
        treeDataProvider.refresh();

        const switchTime = Date.now() - startTime;
        const tabInfo = targetTabCount > 0 ? ` (${targetTabCount} tabs restored)` : ' (no saved tabs)';
        const perfInfo = switchTime > 1000 ? ` in ${(switchTime / 1000).toFixed(1)}s` : '';

        vscode.window.showInformationMessage(
            `Switched to: ${project.name}${tabInfo}${perfInfo}`
        );

        Logger.info(`Successfully switched to project: ${project.name} in ${switchTime}ms`);

    } catch (error: any) {
        Logger.error(`Failed to switch to project: ${project.name}`, error);
        vscode.window.showErrorMessage(`Failed to switch project: ${error.message}`);
    }
}

async function enableProject(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    try {
        updateProject(project.id, { enabled: true });
        saveProjects(context);

        // Update contexts immediately after enabling
        if (updateContexts) {
            await updateContexts();
        }
        treeDataProvider.refresh();

        // Show dynamic order information
        vscode.window.showInformationMessage(`Project "${project.name}" enabled. Dynamic shortcuts have been updated.`);
        Logger.info(`Project enabled: ${project.name} - dynamic order updated`);

    } catch (error: any) {
        Logger.error('Failed to enable project', error);
        vscode.window.showErrorMessage(`Failed to enable project: ${error.message}`);
    }
}

// Enhanced disable function with auto-focus and validation
async function disableProject(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    // Check if there are at least 3 enabled projects (requirement: only allow disable with 2+ remaining)
    const enabledProjects = state.projects.filter(p => p.enabled !== false);
    if (enabledProjects.length <= 2) {
        vscode.window.showWarningMessage(
            `Cannot disable "${project.name}". At least 2 projects must remain enabled. Currently ${enabledProjects.length} projects are enabled.`
        );
        return;
    }

    // If disabling current project, find alternative project to switch to
    let targetProject: ProjectConfig | undefined;
    if (state.currentProjectId === project.id) {
        // Find next best project to switch to (most recently used, enabled project)
        const otherEnabledProjects = enabledProjects
            .filter(p => p.id !== project.id)
            .sort((a, b) => b.lastUsed - a.lastUsed); // Sort by most recently used

        if (otherEnabledProjects.length > 0) {
            targetProject = otherEnabledProjects[0];
        }
    }

    try {
        // First switch to alternative project if needed
        if (targetProject && state.currentProjectId === project.id) {
            Logger.info(`Auto-switching from disabled project "${project.name}" to "${targetProject.name}"`);

            await performOptimizedProjectSwitch(targetProject, context, treeDataProvider, sessionManager);

            // Small delay to ensure switch completes
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Now disable the project
        updateProject(project.id, { enabled: false });
        saveProjects(context);

        // Update UI contexts immediately after disabling project
        if (updateContexts) {
            await updateContexts();
        }
        treeDataProvider.refresh();

        // Show different messages based on whether we auto-switched
        if (targetProject && state.currentProjectId === targetProject.id) {
            vscode.window.showInformationMessage(
                `Project "${project.name}" disabled and switched to "${targetProject.name}". Dynamic shortcuts updated.`
            );
            Logger.info(`Project disabled: ${project.name}, auto-switched to: ${targetProject.name}`);
        } else {
            vscode.window.showInformationMessage(
                `Project "${project.name}" disabled. Dynamic shortcuts have been updated.`
            );
            Logger.info(`Project disabled: ${project.name} - dynamic order updated`);
        }

    } catch (error: any) {
        Logger.error('Failed to disable project', error);
        vscode.window.showErrorMessage(`Failed to disable project: ${error.message}`);
    }
}

async function saveProjectSession(item: ProjectTreeItem, sessionManager: OptimizedSessionManager) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project || project.enabled === false) {
        vscode.window.showWarningMessage(`Project "${project?.name || 'Unknown'}" is disabled`);
        return;
    }

    if (project.sessionEnabled === false) {
        vscode.window.showWarningMessage(`Session management is disabled for project "${project.name}"`);
        return;
    }

    try {
        // Save session with progress for large tab counts
        const tabCount = await sessionManager.getProjectTabCount(project.id);

        if (tabCount > 50) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Saving ${tabCount} tabs for ${project.name}`,
                cancellable: false
            }, async () => {
                await sessionManager.saveCurrentSession();
            });
        } else {
            await sessionManager.saveCurrentSession();
        }

        vscode.window.showInformationMessage(`Session saved for project "${project.name}" (${tabCount} tabs)`);
        Logger.info(`Manually saved session for project: ${project.name} with ${tabCount} tabs`);

    } catch (error: any) {
        Logger.error('Failed to save project session', error);
        vscode.window.showErrorMessage(`Failed to save session: ${error.message}`);
    }
}

async function clearProjectSession(
    item: ProjectTreeItem,
    sessionManager: OptimizedSessionManager,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    const tabCount = await sessionManager.getProjectTabCount(project.id);

    const confirm = await vscode.window.showWarningMessage(
        `Clear ${tabCount} saved tabs for "${project.name}"?`,
        { modal: true },
        'Clear Session',
        'Cancel'
    );

    if (confirm !== 'Clear Session') return;

    try {
        sessionManager.clearSession(project.id);
        treeDataProvider.refresh();

        vscode.window.showInformationMessage(`Session cleared for project "${project.name}"`);
        Logger.info(`Cleared session for project: ${project.name}`);

    } catch (error: any) {
        Logger.error('Failed to clear project session', error);
        vscode.window.showErrorMessage(`Failed to clear session: ${error.message}`);
    }
}

async function moveProjectUp(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project || project.enabled === false) {
        vscode.window.showWarningMessage('Cannot move disabled project');
        return;
    }

    const success = moveProject(item.projectId, 'up');
    if (success) {
        saveProjects(context);
        if (updateContexts) {
            await updateContexts();
        }
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`Moved "${project.name}" up. Dynamic shortcuts updated.`);
    }
}

async function moveProjectDown(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project || project.enabled === false) {
        vscode.window.showWarningMessage('Cannot move disabled project');
        return;
    }

    const success = moveProject(item.projectId, 'down');
    if (success) {
        saveProjects(context);
        if (updateContexts) {
            await updateContexts();
        }
        treeDataProvider.refresh();
        vscode.window.showInformationMessage(`Moved "${project.name}" down. Dynamic shortcuts updated.`);
    }
}

async function toggleProjectFiltering(context: vscode.ExtensionContext, treeDataProvider: ProjectTreeDataProvider) {
    if (!state.workspaceFilter || !state.isProjectSwitcherEnabled) {
        vscode.window.showWarningMessage('Project Switcher must be enabled to use filtering');
        return;
    }

    try {
        const isCurrentlyFiltering = state.workspaceFilter.isCurrentlyFiltering();

        if (isCurrentlyFiltering) {
            await state.workspaceFilter.disableProjectFiltering();
            state.isProjectFilteringEnabled = false;
            vscode.window.showInformationMessage('Project filtering disabled - all folders visible');
        } else {
            if (state.currentProjectId) {
                const project = getProjectById(state.currentProjectId);
                if (project && project.enabled !== false) {
                    await state.workspaceFilter.enableProjectFiltering(project.path);
                    state.isProjectFilteringEnabled = true;
                    vscode.window.showInformationMessage(`Project filtering enabled - showing only: ${project.name}`);
                } else {
                    vscode.window.showWarningMessage('Current project not found or disabled. Please select an enabled project first.');
                }
            } else {
                vscode.window.showWarningMessage('No active project to filter by. Switch to a project first.');
            }
        }

        if (updateContexts) {
            await updateContexts();
        }
    } catch (error: any) {
        Logger.error('Failed to toggle project filtering', error);
        vscode.window.showErrorMessage(`Failed to toggle filtering: ${error.message}`);
    }
}

async function toggleProjectSwitcherMode(context: vscode.ExtensionContext, treeDataProvider: ProjectTreeDataProvider) {
    try {
        if (state.isProjectSwitcherEnabled) {
            await disableProjectSwitcher(context);
            state.isProjectSwitcherEnabled = false;
            await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', false);
            await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects', false);
            vscode.window.showInformationMessage('Project Switcher disabled');
        } else {
            if (!state.workspaceFilter) {
                const WorkspaceFilter = require('../utils/workspaceFilter').WorkspaceFilter;
                state.workspaceFilter = new WorkspaceFilter(context);
            }

            const success = await enableProjectSwitcherManually(context);
            if (success) {
                state.isProjectSwitcherEnabled = true;
                await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', true);
                await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects',
                    state.projects.length > 1);
                vscode.window.showInformationMessage('Project Switcher enabled');
            }
        }

        if (updateContexts) {
            await updateContexts();
        }
        treeDataProvider.refresh();
    } catch (error: any) {
        Logger.error('Failed to toggle Project Switcher mode', error);
        vscode.window.showErrorMessage(`Failed to toggle mode: ${error.message}`);
    }
}

// Hard Reset Implementation - inline since we can't create separate files
async function performHardReset(context: vscode.ExtensionContext, treeDataProvider: ProjectTreeDataProvider) {
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
            await vscode.workspace.fs.stat(vscode.Uri.file(settingsPath));
        } catch {
            Logger.debug('No .vscode/settings.json found, nothing to reset');
            return;
        }

        // Read current settings
        const settingsContent = await vscode.workspace.fs.readFile(vscode.Uri.file(settingsPath));
        const settingsText = Buffer.from(settingsContent).toString('utf8');
        let settings: any;

        try {
            settings = JSON.parse(settingsText);
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
            await vscode.workspace.fs.delete(vscode.Uri.file(settingsPath));
            Logger.info('Removed empty .vscode/settings.json file');
        } else {
            // Write back the cleaned settings
            const newContent = Buffer.from(JSON.stringify(settings, null, 4), 'utf8');
            await vscode.workspace.fs.writeFile(vscode.Uri.file(settingsPath), newContent);
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

async function cleanupWorkspaceSettings(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider
) {
    try {
        // Get current configuration
        const config = vscode.workspace.getConfiguration();
        const currentExcludes = config.get<{ [key: string]: boolean }>('files.exclude') || {};

        // Define default excludes that should remain
        const defaultExcludes = {
            '**/.git': true,
            '**/.svn': true,
            '**/.hg': true,
            '**/.DS_Store': true,
            '**/Thumbs.db': true
        };

        // Remove only non-default excludes
        let hasChanges = false;
        const newExcludes = { ...currentExcludes };

        for (const key in currentExcludes) {
            if (!(key in defaultExcludes) && currentExcludes[key] === true) {
                delete newExcludes[key];
                hasChanges = true;
            }
        }

        if (hasChanges) {
            await config.update('files.exclude', newExcludes, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage('Đã dọn dẹp cài đặt workspace. Các folder bị ẩn đã được hiển thị lại.');
        } else {
            vscode.window.showInformationMessage('Không tìm thấy cài đặt cần dọn dẹp.');
        }

        treeDataProvider.refresh();
    } catch (error: any) {
        Logger.error('Failed to cleanup workspace settings', error);
        vscode.window.showErrorMessage(`Dọn dẹp thất bại: ${error.message}`);
    }
}