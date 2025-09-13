// src/commands/projectCommands.ts - Simplified commands based on requirements
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
import { SessionManager } from '../utils/sessionManager';
import { Logger } from '../utils/logger';

export function registerProjectCommands(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    Logger.info('=== Registering project commands ===');

    const commands = [
        // Core project management - REMOVED: removeProject, editProject, toggleSessionManagement (Requirements 2, 3, 5)
        vscode.commands.registerCommand('project-switcher.switchProject', (item: ProjectTreeItem) => switchProject(item, context, treeDataProvider, sessionManager)),

        // NEW: Toggle project enabled/disabled (Requirement 4)
        vscode.commands.registerCommand('project-switcher.toggleProjectEnabled', (item: ProjectTreeItem) => toggleProjectEnabled(item, context, treeDataProvider)),

        // Session management - REMOVED: toggleSessionManagement (Requirement 5)
        vscode.commands.registerCommand('project-switcher.saveSession', (item: ProjectTreeItem) => saveProjectSession(item, sessionManager)),
        vscode.commands.registerCommand('project-switcher.clearSession', (item: ProjectTreeItem) => clearProjectSession(item, sessionManager, treeDataProvider)),

        // Project ordering (only for enabled projects)
        vscode.commands.registerCommand('project-switcher.moveUp', (item: ProjectTreeItem) => moveProjectUp(item, context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.moveDown', (item: ProjectTreeItem) => moveProjectDown(item, context, treeDataProvider)),

        // UI commands
        vscode.commands.registerCommand('project-switcher.showProjectMenu', () => showProjectMenu(context, treeDataProvider, sessionManager)),

        // Toggle mode command - FIXED: Updated to handle statusbar display
        vscode.commands.registerCommand('project-switcher.toggleMode', () => toggleProjectSwitcherMode(context, treeDataProvider)),

        // Enhanced filtering command
        vscode.commands.registerCommand('project-switcher.toggleFiltering', () => toggleProjectFiltering(context, treeDataProvider)),

        // Ctrl+Alt+M command for project switch menu (only works when enabled)
        vscode.commands.registerCommand('project-switcher.openProjectSwitchMenu', () => openProjectSwitchMenu(context, treeDataProvider, sessionManager)),

        // Keyboard shortcut commands (1-9) - only for enabled projects
        ...Array.from({ length: 9 }, (_, i) => {
            const order = i + 1;
            return vscode.commands.registerCommand(`project-switcher.switchToProject${order}`, () =>
                switchToProjectByOrder(order, context, treeDataProvider, sessionManager)
            );
        }),
    ];

    Logger.info(`Registering ${commands.length} commands...`);
    commands.forEach((cmd, index) => {
        context.subscriptions.push(cmd);
        Logger.debug(`Command ${index + 1} registered`);
    });
    Logger.info('All project commands registered successfully');
}

// NEW: Requirement 4 - Toggle project enabled/disabled
async function toggleProjectEnabled(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    const currentState = project.enabled ?? true; // Default to enabled
    const newState = !currentState;

    try {
        updateProject(project.id, { enabled: newState });
        saveProjects(context);
        treeDataProvider.refresh();

        const statusMsg = newState ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Project "${project.name}" ${statusMsg}`);
        Logger.info(`Project ${statusMsg}: ${project.name}`);

    } catch (error: any) {
        Logger.error('Failed to toggle project enabled state', error);
        vscode.window.showErrorMessage(`Failed to toggle project state: ${error.message}`);
    }
}

// Project switch menu accessible only when Project Switcher is enabled
async function openProjectSwitchMenu(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    if (!state.isProjectSwitcherEnabled) {
        vscode.window.showWarningMessage('Project Switcher is not enabled. Enable it first to use this feature.');
        return;
    }

    if (state.projects.length === 0) {
        vscode.window.showInformationMessage('No projects configured. Enable Project Switcher first.');
        return;
    }

    // Only show enabled projects, excluding current project
    const availableProjects = [...state.projects]
        .filter(project =>
            project.id !== state.currentProjectId &&
            project.enabled !== false // Only enabled projects
        )
        .sort((a, b) => a.order - b.order);

    if (availableProjects.length === 0) {
        vscode.window.showInformationMessage('No other enabled projects available to switch to.');
        return;
    }

    const items = availableProjects.map(project => {
        const sessionInfo = project.sessionEnabled !== false ?
            (state.sessions.has(project.id) ? ' • saved session' : ' • session enabled') :
            ' • session disabled';

        return {
            label: `[${project.order}] ${project.name}`,
            description: project.path,
            detail: `${project.description || ''}${sessionInfo}`,
            project
        };
    });

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select project to switch to (Ctrl+Alt+M)',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selection) {
        await performProjectSwitch(selection.project, context, treeDataProvider, sessionManager);
    }
}

// Enhanced function to toggle project filtering
async function toggleProjectFiltering(context: vscode.ExtensionContext, treeDataProvider: ProjectTreeDataProvider) {
    if (!state.workspaceFilter || !state.isProjectSwitcherEnabled) {
        vscode.window.showWarningMessage('Project Switcher must be enabled to use filtering');
        return;
    }

    try {
        const isCurrentlyFiltering = state.workspaceFilter.isCurrentlyFiltering();

        if (isCurrentlyFiltering) {
            // Disable filtering - show all folders
            await state.workspaceFilter.disableProjectFiltering();
            state.isProjectFilteringEnabled = false;
            updateStatusBar();
            vscode.window.showInformationMessage('Project filtering disabled - all folders visible');
            Logger.info('Project filtering disabled by user');
        } else {
            // Enable filtering - show only active project
            if (state.currentProjectId) {
                const project = getProjectById(state.currentProjectId);
                if (project && project.enabled !== false) {
                    await state.workspaceFilter.enableProjectFiltering(project.path);
                    state.isProjectFilteringEnabled = true;
                    updateStatusBar();
                    vscode.window.showInformationMessage(`Project filtering enabled - showing only: ${project.name}`);
                    Logger.info(`Project filtering enabled for: ${project.name}`);
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

// FIXED: Toggle mode now properly updates statusbar (Fix for Error 2)
async function toggleProjectSwitcherMode(context: vscode.ExtensionContext, treeDataProvider: ProjectTreeDataProvider) {
    try {
        if (state.isProjectSwitcherEnabled) {
            // Currently enabled - ask to disable
            await disableProjectSwitcher(context);
            state.isProjectSwitcherEnabled = false;

            // Update contexts after disabling
            await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', false);
            await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects', false);

            // FIXED: Hide statusbar item when disabled
            if (state.statusBarItem) {
                state.statusBarItem.hide();
            }

            treeDataProvider.refresh();
        } else {
            // Currently disabled - enable with ALL folders
            const success = await enableProjectSwitcherManually(context);
            if (success) {
                state.isProjectSwitcherEnabled = true;

                // Update contexts after enabling
                await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', true);
                await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects',
                    state.projects.length > 1);

                // FIXED: Show and update statusbar item when enabled
                updateStatusBar();

                treeDataProvider.refresh();
            }
        }
    } catch (error: any) {
        Logger.error('Failed to toggle Project Switcher mode', error);
        vscode.window.showErrorMessage(`Failed to toggle mode: ${error.message}`);
    }
}

async function saveProjectSession(item: ProjectTreeItem, sessionManager: SessionManager) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project || project.enabled === false) {
        vscode.window.showWarningMessage(`Project "${project?.name || 'Unknown'}" is disabled`);
        return;
    }

    if (!project.sessionEnabled) {
        vscode.window.showWarningMessage(`Session management is disabled for project "${project.name}"`);
        return;
    }

    try {
        // Temporarily set current project to save its session
        const originalCurrentProject = state.currentProjectId;
        state.currentProjectId = project.id;

        await sessionManager.saveCurrentSession();

        // Restore original current project
        state.currentProjectId = originalCurrentProject;

        vscode.window.showInformationMessage(`Session saved for project "${project.name}"`);
        Logger.info(`Manually saved session for project: ${project.name}`);

    } catch (error: any) {
        Logger.error('Failed to save project session', error);
        vscode.window.showErrorMessage(`Failed to save session: ${error.message}`);
    }
}

async function clearProjectSession(
    item: ProjectTreeItem,
    sessionManager: SessionManager,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    const confirm = await vscode.window.showQuickPick(
        ['Cancel', `Clear session for "${project.name}"`],
        { placeHolder: `Are you sure you want to clear the session for "${project.name}"?` }
    );

    if (confirm !== `Clear session for "${project.name}"`) return;

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

async function switchProject(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project || project.enabled === false) {
        vscode.window.showWarningMessage(`Project "${project?.name || 'Unknown'}" is disabled`);
        return;
    }

    await performProjectSwitch(project, context, treeDataProvider, sessionManager);
}

async function switchToProjectByOrder(
    order: number,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
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

    await performProjectSwitch(project, context, treeDataProvider, sessionManager);
}

async function performProjectSwitch(
    project: ProjectConfig,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    let oldProjectId: string | undefined;

    try {
        Logger.info(`Switching to project: ${project.name}`);

        // Save current session if we have a current project and it has session management enabled
        if (state.currentProjectId && state.currentProjectId !== project.id) {
            const currentProject = getProjectById(state.currentProjectId);
            if (currentProject?.sessionEnabled !== false) {
                await sessionManager.saveCurrentSession();
                Logger.debug('Saved current session before switching');
            }
        }

        // Check if project path still exists
        const pathExists = await validateProjectPath(project.path);
        if (!pathExists) {
            vscode.window.showErrorMessage(`Project path no longer exists: ${project.path}`);
            return;
        }

        // Validate workspace context
        const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!currentWorkspace) {
            vscode.window.showErrorMessage('No workspace is currently open');
            return;
        }

        // Validate that project is within current workspace
        const workspaceParent = path.resolve(currentWorkspace);
        const projectParent = path.resolve(path.dirname(project.path));

        if (workspaceParent !== projectParent) {
            Logger.error(`Project ${project.name} is not in current workspace parent directory`);
            vscode.window.showErrorMessage(`Project must be within current workspace: ${currentWorkspace}`);
            return;
        }

        // Store old project ID before updating
        oldProjectId = state.currentProjectId;

        // Update current project immediately
        state.currentProjectId = project.id;
        project.lastUsed = Date.now();

        // SIMPLIFIED: Always enable filtering when switching projects
        if (state.workspaceFilter && state.isProjectSwitcherEnabled) {
            await state.workspaceFilter.enableProjectFiltering(project.path);
            state.isProjectFilteringEnabled = true;
            Logger.debug(`Auto-enabled filtering for project: ${project.name}`);
        }

        // Close all editors first
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // Delay to ensure filtering takes effect
        await new Promise(resolve => setTimeout(resolve, 500));

        // Focus project directory in explorer
        const projectUri = vscode.Uri.file(project.path);
        await vscode.commands.executeCommand('revealInExplorer', projectUri);
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');

        // Another small delay before restoring session
        await new Promise(resolve => setTimeout(resolve, 300));

        // Restore session only if enabled for this project
        if (project.sessionEnabled !== false) {
            await sessionManager.restoreSession(project.id);
        }

        // Save projects and update UI
        saveProjects(context);
        treeDataProvider.refresh();
        updateStatusBar();

        // Show success message
        const sessionInfo = project.sessionEnabled !== false ?
            (await sessionManager.getProjectTabCount(project.id) > 0 ?
                ` (${await sessionManager.getProjectTabCount(project.id)} tabs restored)` :
                ' (no saved session)') :
            ' (session disabled)';

        vscode.window.showInformationMessage(`Switched to: ${project.name}${sessionInfo}`);
        Logger.info(`Successfully switched to project: ${project.name} with filtering enabled`);

    } catch (error: any) {
        Logger.error(`Failed to switch to project: ${project.name}`, error);
        vscode.window.showErrorMessage(`Failed to switch project: ${error.message}`);

        // Restore previous project on failure
        if (oldProjectId && oldProjectId !== project.id) {
            state.currentProjectId = oldProjectId;
        }
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

// Simplified project menu
async function showProjectMenu(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    const items = [];

    // Add filtering option if Project Switcher is enabled
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
            // Focus on the project view
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

function updateStatusBar() {
    if (!state.statusBarItem) return;

    if (state.currentProjectId) {
        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (project) {
            let statusText = `$(folder) ${project.name} [${project.order}]`;

            // Add filtering indicator
            if (state.workspaceFilter?.isCurrentlyFiltering()) {
                statusText += ' $(filter)';
            }

            state.statusBarItem.text = statusText;

            let tooltip = `Current project: ${project.name}\nPath: ${project.path}\nShortcut: Ctrl+Alt+${project.order}\nSession: ${project.sessionEnabled !== false ? 'Enabled' : 'Disabled'}`;

            // Add filtering status to tooltip
            if (state.workspaceFilter) {
                const filterStatus = state.workspaceFilter.isCurrentlyFiltering() ? 'Enabled (showing only current project)' : 'Disabled (showing all folders)';
                tooltip += `\nFiltering: ${filterStatus}`;
            }

            tooltip += '\nClick to switch project';
            state.statusBarItem.tooltip = tooltip;
            state.statusBarItem.show();
            return;
        }
    }

    let statusText = `$(folder) No Project`;
    if (state.workspaceFilter?.isCurrentlyFiltering()) {
        statusText += ' $(filter)';
    }

    state.statusBarItem.text = statusText;
    state.statusBarItem.tooltip = 'No project selected. Click to manage projects.';
    state.statusBarItem.show();
}