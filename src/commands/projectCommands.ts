// src/commands/projectCommands.ts - Updated to use optimized session manager
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectTreeItem, ProjectConfig } from '../models/models';
import {
    updateProject,
    moveProject,
    saveProjects,
    getProjectById,
    getProjectByOrder,
    validateProjectPath,
    enableProjectSwitcherManually,
    disableProjectSwitcher,
    switchToProject
} from '../utils/projectUtils';
import { ProjectTreeDataProvider } from '../providers/projectTreeDataProvider';
import { OptimizedSessionManager } from '../utils/optimizedSessionManager';
import { Logger } from '../utils/logger';
import { updateStatusBar } from '../utils/statusBarUtils';

export function registerProjectCommands(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager // Updated type
) {
    Logger.info('=== Registering project commands with optimized session manager ===');

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
        vscode.commands.registerCommand('project-switcher.showProjectMenu', () =>
            showProjectMenu(context, treeDataProvider, sessionManager)),
        vscode.commands.registerCommand('project-switcher.toggleMode', () =>
            toggleProjectSwitcherMode(context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.toggleFiltering', () =>
            toggleProjectFiltering(context, treeDataProvider)),

        // Enhanced project switch menu with performance indicator
        vscode.commands.registerCommand('project-switcher.openProjectSwitchMenu', () =>
            openOptimizedProjectSwitchMenu(context, treeDataProvider, sessionManager)),

        // Keyboard shortcut commands (1-9) with optimization
        ...Array.from({ length: 9 }, (_, i) => {
            const order = i + 1;
            return vscode.commands.registerCommand(`project-switcher.switchToProject${order}`, () =>
                switchToProjectByOrderOptimized(order, context, treeDataProvider, sessionManager)
            );
        }),
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
    Logger.info(`Registered ${commands.length} optimized commands`);
}

// OPTIMIZED: Fast project switching with tab hiding
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

async function switchToProjectByOrderOptimized(
    order: number,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    const project = getProjectByOrder(order);
    if (!project) {
        vscode.window.showWarningMessage(`No project assigned to shortcut ${order}`);
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

    // Enhanced items with performance indicators
    const items = await Promise.all(availableProjects.map(async project => {
        const tabCount = await sessionManager.getProjectTabCount(project.id);
        const sessionInfo = project.sessionEnabled !== false ?
            (tabCount > 0 ? ` • ${tabCount} tabs (optimized)` : ' • session enabled') :
            ' • session disabled';

        // Performance indicator for large numbers of tabs
        const perfIndicator = tabCount > 50 ? ' ⚡' : tabCount > 20 ? ' 🔸' : '';

        return {
            label: `[${project.order}] ${project.name}${perfIndicator}`,
            description: project.path,
            detail: `${project.description || ''}${sessionInfo}`,
            project
        };
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select project to switch to (⚡= optimized for 50+ tabs, 🔸= 20+ tabs)',
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
        let progress: vscode.Progress<{ message?: string }> | undefined;

        if (showProgress) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Switching to ${project.name}`,
                cancellable: false
            }, async (progressReporter) => {
                progress = progressReporter;

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

        // Update UI
        treeDataProvider.refresh();
        updateStatusBar();

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

// Other optimized functions...
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
        treeDataProvider.refresh();

        vscode.window.showInformationMessage(`Project "${project.name}" enabled`);
        Logger.info(`Project enabled: ${project.name}`);

    } catch (error: any) {
        Logger.error('Failed to enable project', error);
        vscode.window.showErrorMessage(`Failed to enable project: ${error.message}`);
    }
}

async function disableProject(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    try {
        updateProject(project.id, { enabled: false });
        saveProjects(context);
        treeDataProvider.refresh();

        vscode.window.showInformationMessage(`Project "${project.name}" disabled`);
        Logger.info(`Project disabled: ${project.name}`);

        // If disabling current project, offer to switch
        if (state.currentProjectId === project.id) {
            const enabledProjects = state.projects.filter(p => p.enabled !== false && p.id !== project.id);
            if (enabledProjects.length > 0) {
                const switchMsg = await vscode.window.showInformationMessage(
                    `Current project "${project.name}" has been disabled. Switch to another project?`,
                    'Switch to Another',
                    'Stay Here'
                );

                if (switchMsg === 'Switch to Another') {
                    await openOptimizedProjectSwitchMenu(context, treeDataProvider, sessionManager);
                }
            }
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

// Helper functions remain the same...
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
        treeDataProvider.refresh();
        updateStatusBar();
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
        treeDataProvider.refresh();
        updateStatusBar();
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
            updateStatusBar();
            vscode.window.showInformationMessage('Project filtering disabled - all folders visible');
        } else {
            if (state.currentProjectId) {
                const project = getProjectById(state.currentProjectId);
                if (project && project.enabled !== false) {
                    await state.workspaceFilter.enableProjectFiltering(project.path);
                    state.isProjectFilteringEnabled = true;
                    updateStatusBar();
                    vscode.window.showInformationMessage(`Project filtering enabled - showing only: ${project.name}`);
                } else {
                    vscode.window.showWarningMessage('Current project not found or disabled. Please select an enabled project first.');
                }
            } else {
                vscode.window.showWarningMessage('No active project to filter by. Switch to a project first.');
            }
        }
    } catch (error: any) {
        Logger.error('Failed to toggle project filtering', error);
        vscode.window.showErrorMessage(`Failed to toggle filtering: ${error.message}`);
    }
}

async function toggleProjectSwitcherMode(context: vscode.ExtensionContext, treeDataProvider: ProjectTreeDataProvider) {
    try {
        if (state.isProjectSwitcherEnabled) {
            // FIXED: await the disableProjectSwitcher function since it returns Promise<void>
            await disableProjectSwitcher(context);

            // Always update state after disabling (no need to check return value)
            state.isProjectSwitcherEnabled = false;
            await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', false);
            await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects', false);

            if (state.statusBarItem) {
                state.statusBarItem.hide();
            }
            treeDataProvider.refresh();
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

                const { createStatusBarItem } = require('../utils/statusBarUtils');
                createStatusBarItem(context);
                updateStatusBar();
                treeDataProvider.refresh();
            }
        }
    } catch (error: any) {
        Logger.error('Failed to toggle Project Switcher mode', error);
        vscode.window.showErrorMessage(`Failed to toggle mode: ${error.message}`);
    }
}

async function showProjectMenu(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    const items = [];

    if (state.isProjectSwitcherEnabled && state.workspaceFilter) {
        const filteringStatus = state.workspaceFilter.isCurrentlyFiltering() ?
            'Disable Project Filtering' : 'Enable Project Filtering';
        items.push(filteringStatus);
    }

    items.push('Manage Projects');

    if (state.currentProjectId) {
        items.push('Save Current Session');
    }

    items.push('Clear All Sessions');

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Project Switcher Menu'
    });

    switch (selection) {
        case 'Enable Project Filtering':
        case 'Disable Project Filtering':
            await toggleProjectFiltering(context, treeDataProvider);
            break;

        case 'Save Current Session':
            if (state.currentProjectId) {
                await sessionManager.saveCurrentSession();
                vscode.window.showInformationMessage('Session saved');
            }
            break;

        case 'Manage Projects':
            vscode.commands.executeCommand('workbench.view.extension.project-switcher');
            break;

        case 'Clear All Sessions':
            const confirm = await vscode.window.showQuickPick(
                ['Cancel', 'Clear All Sessions'],
                { placeHolder: 'Are you sure? This will clear all saved tab sessions.' }
            );
            if (confirm === 'Clear All Sessions') {
                sessionManager.clearAllSessions();
                vscode.window.showInformationMessage('All sessions cleared');
            }
            break;
    }
}