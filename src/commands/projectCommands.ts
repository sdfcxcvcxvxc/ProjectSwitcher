import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectTreeItem, ProjectConfig } from '../models/models';
import {
    createProject,
    updateProject,
    deleteProject,
    moveProject,
    saveProjects,
    getProjectById,
    getProjectByOrder,
    validateProjectPath,
    getNextAvailableOrder
} from '../utils/projectUtils';
import { ProjectTreeDataProvider } from '../providers/projectTreeDataProvider';
import { SessionManager } from '../utils/sessionManager';
import { Logger } from '../utils/logger';

export function registerProjectCommands(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    const commands = [
        // Core project management
        vscode.commands.registerCommand('project-switcher.addProject', () => addCurrentProject(context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.removeProject', (item: ProjectTreeItem) => removeProject(item, context, treeDataProvider, sessionManager)),
        vscode.commands.registerCommand('project-switcher.editProject', (item: ProjectTreeItem) => editProject(item, context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.switchProject', (item: ProjectTreeItem) => switchProject(item, context, treeDataProvider, sessionManager)),

        // Session management
        vscode.commands.registerCommand('project-switcher.toggleSessionManagement', (item: ProjectTreeItem) => toggleSessionManagement(item, context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.saveSession', (item: ProjectTreeItem) => saveProjectSession(item, sessionManager)),
        vscode.commands.registerCommand('project-switcher.clearSession', (item: ProjectTreeItem) => clearProjectSession(item, sessionManager, treeDataProvider)),

        // Project ordering
        vscode.commands.registerCommand('project-switcher.moveUp', (item: ProjectTreeItem) => moveProjectUp(item, context, treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.moveDown', (item: ProjectTreeItem) => moveProjectDown(item, context, treeDataProvider)),

        // UI commands
        vscode.commands.registerCommand('project-switcher.refreshProjects', () => refreshProjects(treeDataProvider)),
        vscode.commands.registerCommand('project-switcher.showProjectMenu', () => showProjectMenu(context, treeDataProvider, sessionManager)),

        // Keyboard shortcut commands (1-9)
        ...Array.from({ length: 9 }, (_, i) => {
            const order = i + 1;
            return vscode.commands.registerCommand(`project-switcher.switchToProject${order}`, () =>
                switchToProjectByOrder(order, context, treeDataProvider, sessionManager)
            );
        }),
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
}

async function addCurrentProject(context: vscode.ExtensionContext, treeDataProvider: ProjectTreeDataProvider) {
    try {
        // Check if we have space for more projects
        const availableOrder = getNextAvailableOrder();
        if (!availableOrder) {
            vscode.window.showErrorMessage('Maximum of 9 projects allowed');
            return;
        }

        // Check if there's a current workspace
        if (!vscode.workspace.workspaceFolders || !vscode.workspace.workspaceFolders.length) {
            vscode.window.showErrorMessage('No workspace folder is currently open');
            return;
        }

        const currentWorkspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const projectName = path.basename(currentWorkspacePath);

        // Validate path
        const isValidPath = await validateProjectPath(currentWorkspacePath);
        if (!isValidPath) {
            vscode.window.showErrorMessage('Invalid project path');
            return;
        }

        // Check for duplicates
        const existingProject = state.projects.find(p =>
            path.resolve(p.path) === path.resolve(currentWorkspacePath)
        );

        if (existingProject) {
            vscode.window.showErrorMessage(`Project already exists: ${existingProject.name}`);
            return;
        }

        // Create project automatically with current workspace info
        const project = createProject(projectName, currentWorkspacePath);

        // Enable session management by default for new projects
        project.sessionEnabled = true;

        saveProjects(context);

        treeDataProvider.refresh();
        updateStatusBar();

        vscode.window.showInformationMessage(
            `Project "${projectName}" added automatically with shortcut Ctrl+Alt+${project.order}`
        );
        Logger.info(`Auto-added current workspace as project: ${projectName} at ${currentWorkspacePath} with order ${project.order}`);

    } catch (error: any) {
        Logger.error('Failed to add current project', error);
        vscode.window.showErrorMessage(`Failed to add project: ${error.message}`);
    }
}

async function toggleSessionManagement(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    const currentState = project.sessionEnabled ?? true;
    const newState = !currentState;

    try {
        updateProject(project.id, { sessionEnabled: newState });
        saveProjects(context);
        treeDataProvider.refresh();

        const statusMsg = newState ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Session management ${statusMsg} for project "${project.name}"`);
        Logger.info(`Session management ${statusMsg} for project: ${project.name}`);

    } catch (error: any) {
        Logger.error('Failed to toggle session management', error);
        vscode.window.showErrorMessage(`Failed to toggle session management: ${error.message}`);
    }
}

async function saveProjectSession(item: ProjectTreeItem, sessionManager: SessionManager) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

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

async function removeProject(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    const confirm = await vscode.window.showQuickPick(
        ['Cancel', `Delete "${project.name}"`],
        { placeHolder: `Are you sure you want to delete project "${project.name}"?` }
    );

    if (confirm !== `Delete "${project.name}"`) return;

    try {
        // Clear session for this project
        sessionManager.clearSession(project.id);

        // Delete project
        deleteProject(project.id);
        saveProjects(context);

        treeDataProvider.refresh();
        updateStatusBar();

        vscode.window.showInformationMessage(`Project "${project.name}" deleted`);
        Logger.info(`Deleted project: ${project.name}`);

    } catch (error: any) {
        Logger.error('Failed to delete project', error);
        vscode.window.showErrorMessage(`Failed to delete project: ${error.message}`);
    }
}

async function editProject(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

    const project = getProjectById(item.projectId);
    if (!project) return;

    // Edit name
    const newName = await vscode.window.showInputBox({
        prompt: 'Enter new project name',
        value: project.name
    });

    if (!newName) return;

    // Edit description
    const newDescription = await vscode.window.showInputBox({
        prompt: 'Enter project description (optional)',
        value: project.description || ''
    });

    try {
        updateProject(project.id, {
            name: newName,
            description: newDescription || undefined
        });

        saveProjects(context);
        treeDataProvider.refresh();
        updateStatusBar();

        vscode.window.showInformationMessage(`Project updated: ${newName}`);
        Logger.info(`Updated project: ${project.id} -> ${newName}`);

    } catch (error: any) {
        Logger.error('Failed to edit project', error);
        vscode.window.showErrorMessage(`Failed to edit project: ${error.message}`);
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
    if (!project) return;

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

    await performProjectSwitch(project, context, treeDataProvider, sessionManager);
}

async function performProjectSwitch(
    project: ProjectConfig,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    try {
        Logger.info(`Switching to project: ${project.name}`);

        // Save current session if we have a current project and it has session management enabled
        if (state.currentProjectId) {
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

        // Get current workspace path for comparison
        const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetPath = path.resolve(project.path);
        const currentPath = currentWorkspace ? path.resolve(currentWorkspace) : '';

        // If we're already in the target workspace, just restore session
        if (currentPath === targetPath) {
            Logger.debug('Already in target workspace, restoring session only');
            state.currentProjectId = project.id;
            project.lastUsed = Date.now();

            // Restore session only if enabled for this project
            if (project.sessionEnabled !== false) {
                await sessionManager.restoreSession(project.id);
            }

            saveProjects(context);
            treeDataProvider.refresh();
            updateStatusBar();

            vscode.window.showInformationMessage(`Switched to project: ${project.name}`);
            return;
        }

        // Switch workspace folder without opening new window
        const uri = vscode.Uri.file(project.path);
        await vscode.commands.executeCommand('vscode.openFolder', uri, false);

        // Update current project (this will be called after workspace changes)
        state.currentProjectId = project.id;
        project.lastUsed = Date.now();

        saveProjects(context);

        Logger.info(`Successfully switched to project: ${project.name}`);

        // Note: Session restoration will happen after workspace loads
        // We'll set up a workspace change listener for this

    } catch (error: any) {
        Logger.error(`Failed to switch to project: ${project.name}`, error);
        vscode.window.showErrorMessage(`Failed to switch project: ${error.message}`);
    }
}

async function moveProjectUp(
    item: ProjectTreeItem,
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider
) {
    if (!item.projectId) return;

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

    const success = moveProject(item.projectId, 'down');
    if (success) {
        saveProjects(context);
        treeDataProvider.refresh();
        updateStatusBar();
    }
}

function refreshProjects(treeDataProvider: ProjectTreeDataProvider) {
    treeDataProvider.refresh();
    updateStatusBar();
    Logger.debug('Refreshed project tree view');
}

async function showProjectMenu(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    const items = [
        'Add Current Workspace',
        'Switch Project',
        'Manage Projects',
        'Clear All Sessions'
    ];

    if (state.currentProjectId) {
        items.splice(1, 0, 'Save Current Session');
    }

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Project Switcher'
    });

    switch (selection) {
        case 'Add Current Workspace':
            await addCurrentProject(context, treeDataProvider);
            break;

        case 'Switch Project':
            await showProjectSwitchMenu(context, treeDataProvider, sessionManager);
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

async function showProjectSwitchMenu(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    if (state.projects.length === 0) {
        vscode.window.showInformationMessage('No projects configured. Add current workspace first.');
        return;
    }

    const sortedProjects = [...state.projects].sort((a, b) => a.order - b.order);

    const items = sortedProjects.map(project => ({
        label: `[${project.order}] ${project.name}`,
        description: project.path,
        detail: project.description,
        project
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select project to switch to',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (selection) {
        await performProjectSwitch(selection.project, context, treeDataProvider, sessionManager);
    }
}

function updateStatusBar() {
    if (!state.statusBarItem) return;

    if (state.currentProjectId) {
        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (project) {
            state.statusBarItem.text = `$(folder) ${project.name} [${project.order}]`;
            state.statusBarItem.tooltip = `Current project: ${project.name}\nPath: ${project.path}\nShortcut: Ctrl+Alt+${project.order}\nSession: ${project.sessionEnabled !== false ? 'Enabled' : 'Disabled'}\nClick to switch project`;
            state.statusBarItem.show();
            return;
        }
    }

    state.statusBarItem.text = `$(folder) No Project`;
    state.statusBarItem.tooltip = 'No project selected. Click to manage projects.';
    state.statusBarItem.show();
}