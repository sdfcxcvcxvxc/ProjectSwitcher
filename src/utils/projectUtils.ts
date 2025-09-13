import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { state, ProjectConfig, WorkspaceMode } from '../models/models';
import { Logger } from './logger';

export function loadProjects(context: vscode.ExtensionContext) {
    const stored = context.globalState.get<ProjectConfig[]>('projects');
    if (stored) {
        state.projects.splice(0, state.projects.length, ...stored);
        Logger.debug(`Loaded ${state.projects.length} projects`);
    }
}

export function saveProjects(context: vscode.ExtensionContext) {
    context.globalState.update('projects', state.projects);
    Logger.debug(`Saved ${state.projects.length} projects`);
}

export async function detectWorkspaceMode(): Promise<WorkspaceMode> {
    if (!vscode.workspace.workspaceFolders || !vscode.workspace.workspaceFolders.length) {
        return WorkspaceMode.None;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

    try {
        const entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });

        // Count directories and files
        const directories = entries.filter(entry => entry.isDirectory());
        const files = entries.filter(entry => entry.isFile() && !entry.name.startsWith('.'));

        // If workspace has 2+ directories and no meaningful files, it's a parent directory
        if (directories.length >= 2 && files.length === 0) {
            return WorkspaceMode.ParentDirectory;
        }

        // If it's a regular project directory
        return WorkspaceMode.SingleProject;

    } catch (error) {
        Logger.error('Failed to detect workspace mode', error);
        return WorkspaceMode.SingleProject;
    }
}

export async function getSubdirectories(parentPath: string): Promise<string[]> {
    try {
        const entries = await fs.promises.readdir(parentPath, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
            .map(entry => entry.name);
    } catch (error) {
        Logger.error('Failed to get subdirectories', error);
        return [];
    }
}

export async function initializeProjectSwitcher(context: vscode.ExtensionContext): Promise<boolean> {
    const workspaceMode = await detectWorkspaceMode();
    state.workspaceMode = workspaceMode;

    if (workspaceMode === WorkspaceMode.ParentDirectory) {
        // Check if project switcher is enabled
        const isEnabled = context.globalState.get<boolean>('projectSwitcherEnabled');
        if (isEnabled === undefined) {
            // First time - ask user
            const enable = await askEnableProjectSwitcher();
            if (enable) {
                await enableProjectSwitcher(context);
                return true;
            } else {
                context.globalState.update('projectSwitcherEnabled', false);
                return false;
            }
        } else if (isEnabled) {
            await enableProjectSwitcher(context);
            return true;
        }
    }

    return false;
}

async function askEnableProjectSwitcher(): Promise<boolean> {
    const selection = await vscode.window.showInformationMessage(
        'This workspace contains multiple subdirectories. Would you like to enable Project Switcher to manage them as separate projects?',
        'Enable',
        'Not Now'
    );

    return selection === 'Enable';
}

async function enableProjectSwitcher(context: vscode.ExtensionContext) {
    context.globalState.update('projectSwitcherEnabled', true);

    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const subdirs = await getSubdirectories(workspaceRoot);

    // Auto-create projects for all subdirectories
    for (let i = 0; i < Math.min(subdirs.length, 9); i++) {
        const subdir = subdirs[i];
        const subdirPath = path.join(workspaceRoot, subdir);

        // Check if project already exists
        const exists = state.projects.find(p => p.path === subdirPath);
        if (!exists) {
            const project = createProject(subdir, subdirPath, `Project in ${subdir}`);
            project.order = i + 1;
        }
    }

    saveProjects(context);

    // Set first project as current if none selected
    if (!state.currentProjectId && state.projects.length > 0) {
        state.currentProjectId = state.projects[0].id;
    }
}

export function createProject(
    name: string,
    projectPath: string,
    description?: string
): ProjectConfig {
    const project: ProjectConfig = {
        id: Date.now().toString(),
        name,
        path: projectPath,
        order: 0, // Will be set later
        description,
        lastUsed: Date.now(),
        sessionEnabled: true
    };

    state.projects.push(project);
    Logger.info(`Created project: ${name}`);

    return project;
}

export async function switchToProject(projectId: string): Promise<boolean> {
    const project = getProjectById(projectId);
    if (!project) {
        Logger.error(`Project not found: ${projectId}`);
        return false;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

    // Validate project is subdirectory of workspace
    if (!project.path.startsWith(workspaceRoot)) {
        Logger.error(`Project path is not within workspace: ${project.path}`);
        return false;
    }

    try {
        Logger.info(`Switching to project: ${project.name}`);

        // Save current project session first
        if (state.currentProjectId && state.currentProjectId !== projectId) {
            await saveCurrentProjectSession();
        }

        // Close all editors
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // Update current project
        const oldProjectId = state.currentProjectId;
        state.currentProjectId = projectId;
        project.lastUsed = Date.now();

        // Restore project session
        await restoreProjectSession(projectId);

        // Update file explorer to show project directory
        await focusProjectInExplorer(project.path);

        Logger.info(`Successfully switched to project: ${project.name}`);
        return true;

    } catch (error) {
        Logger.error(`Failed to switch to project: ${project.name}`, error);
        return false;
    }
}

async function saveCurrentProjectSession() {
    if (!state.currentProjectId) return;

    const sessionManager = getSessionManager();
    if (sessionManager) {
        await sessionManager.saveCurrentSession();
    }
}

async function restoreProjectSession(projectId: string) {
    const sessionManager = getSessionManager();
    if (sessionManager) {
        await sessionManager.restoreSession(projectId);
    }
}

async function focusProjectInExplorer(projectPath: string) {
    try {
        const uri = vscode.Uri.file(projectPath);
        await vscode.commands.executeCommand('revealInExplorer', uri);
    } catch (error) {
        Logger.warn('Failed to focus project in explorer', error);
    }
}

function getSessionManager() {
    // This would be injected or retrieved from state
    return state.sessionManager;
}

export function getProjectById(id: string): ProjectConfig | undefined {
    return state.projects.find(p => p.id === id);
}

export function getProjectByOrder(order: number): ProjectConfig | undefined {
    return state.projects.find(p => p.order === order);
}

export function updateProject(
    projectId: string,
    updates: Partial<ProjectConfig>
): boolean {
    const project = getProjectById(projectId);
    if (!project) {
        Logger.warn(`Project not found: ${projectId}`);
        return false;
    }

    Object.assign(project, updates);
    project.lastUsed = Date.now();

    Logger.info(`Updated project: ${project.name}`);
    return true;
}

export function deleteProject(projectId: string): boolean {
    const index = state.projects.findIndex(p => p.id === projectId);
    if (index === -1) {
        Logger.warn(`Project not found for deletion: ${projectId}`);
        return false;
    }

    const project = state.projects[index];
    state.projects.splice(index, 1);

    // Clear current project if it's the deleted one
    if (state.currentProjectId === projectId) {
        state.currentProjectId = state.projects.length > 0 ? state.projects[0].id : undefined;
    }

    Logger.info(`Deleted project: ${project.name}`);
    return true;
}

export async function disableProjectSwitcher(context: vscode.ExtensionContext): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        'This will disable Project Switcher and clear all project configurations. Continue?',
        'Disable',
        'Cancel'
    );

    if (confirm === 'Disable') {
        context.globalState.update('projectSwitcherEnabled', false);
        state.projects.length = 0;
        state.currentProjectId = undefined;
        state.sessions.clear();
        saveProjects(context);

        vscode.window.showInformationMessage('Project Switcher disabled');
        Logger.info('Project Switcher disabled by user');
    }
}
export function moveProject(projectId: string, direction: 'up' | 'down'): boolean {
    const project = getProjectById(projectId);
    if (!project) {
        Logger.warn(`Project not found for move: ${projectId}`);
        return false;
    }

    const sortedProjects = [...state.projects].sort((a, b) => a.order - b.order);
    const currentIndex = sortedProjects.findIndex(p => p.id === projectId);

    if (currentIndex === -1) {
        Logger.warn(`Project not found in sorted list: ${projectId}`);
        return false;
    }

    let targetIndex: number;
    if (direction === 'up') {
        targetIndex = currentIndex - 1;
        if (targetIndex < 0) {
            Logger.debug('Cannot move project up - already at top');
            return false;
        }
    } else {
        targetIndex = currentIndex + 1;
        if (targetIndex >= sortedProjects.length) {
            Logger.debug('Cannot move project down - already at bottom');
            return false;
        }
    }

    // Swap orders
    const currentProject = sortedProjects[currentIndex];
    const targetProject = sortedProjects[targetIndex];

    const tempOrder = currentProject.order;
    currentProject.order = targetProject.order;
    targetProject.order = tempOrder;

    Logger.info(`Moved project ${currentProject.name} ${direction}`);
    return true;
}

export async function validateProjectPath(projectPath: string): Promise<boolean> {
    try {
        const stats = await fs.promises.stat(projectPath);
        return stats.isDirectory();
    } catch (error) {
        Logger.warn(`Invalid project path: ${projectPath}`, error);
        return false;
    }
}

export function getNextAvailableOrder(): number | null {
    const usedOrders = new Set(state.projects.map(p => p.order));

    for (let i = 1; i <= 9; i++) {
        if (!usedOrders.has(i)) {
            return i;
        }
    }

    return null; // All slots 1-9 are taken
}