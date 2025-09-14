// src/utils/projectUtils.ts - Added dynamic order reassignment for enabled projects
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { state, ProjectConfig, WorkspaceMode } from '../models/models';
import { Logger } from './logger';

export function loadProjects(context: vscode.ExtensionContext) {
    const stored = context.globalState.get<ProjectConfig[]>('projects');
    if (stored) {
        // Ensure all projects have enabled property
        const normalizedProjects = stored.map(project => ({
            ...project,
            enabled: project.enabled !== undefined ? project.enabled : true
        }));
        state.projects.splice(0, state.projects.length, ...normalizedProjects);
        Logger.debug(`Loaded ${state.projects.length} projects`);
    }
}

export function saveProjects(context: vscode.ExtensionContext) {
    context.globalState.update('projects', state.projects);
    Logger.debug(`Saved ${state.projects.length} projects`);

    // Refresh both tree providers when projects change
    vscode.commands.executeCommand('project-switcher.refreshAllTrees');
}

// NEW: Get enabled projects with dynamic order assignment
export function getEnabledProjectsWithDynamicOrder(): ProjectConfig[] {
    const enabledProjects = state.projects
        .filter(project => project.enabled !== false)
        .sort((a, b) => a.order - b.order);

    return enabledProjects;
}

// NEW: Get dynamic order for an enabled project (1-based)
export function getDynamicOrder(projectId: string): number | null {
    const enabledProjects = getEnabledProjectsWithDynamicOrder();
    const index = enabledProjects.findIndex(p => p.id === projectId);
    return index >= 0 ? index + 1 : null;
}

// NEW: Get project by dynamic order (for keyboard shortcuts)
export function getProjectByDynamicOrder(dynamicOrder: number): ProjectConfig | undefined {
    const enabledProjects = getEnabledProjectsWithDynamicOrder();
    return enabledProjects[dynamicOrder - 1]; // Convert 1-based to 0-based index
}

export async function detectWorkspaceMode(): Promise<WorkspaceMode> {
    if (!vscode.workspace.workspaceFolders || !vscode.workspace.workspaceFolders.length) {
        return WorkspaceMode.None;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

    try {
        const entries = await fs.promises.readdir(workspaceRoot, { withFileTypes: true });

        // Count directories and files (excluding hidden files)
        const directories = entries.filter(entry =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            !entry.name.startsWith('node_modules')
        );
        const meaningfulFiles = entries.filter(entry =>
            entry.isFile() &&
            !entry.name.startsWith('.') &&
            !['README.md', 'LICENSE', '.gitignore'].includes(entry.name)
        );

        // If workspace has 2+ directories and no meaningful files, it's a parent directory
        if (directories.length >= 2 && meaningfulFiles.length === 0) {
            Logger.info(`Detected parent directory with ${directories.length} subdirectories`);
            return WorkspaceMode.ParentDirectory;
        }

        // If it's a regular project directory
        return WorkspaceMode.SingleProject;

    } catch (error) {
        Logger.error('Failed to detect workspace mode', error);
        return WorkspaceMode.SingleProject;
    }
}

export async function getSubdirectories(parentPath: string): Promise<{ name: string, path: string }[]> {
    try {
        const entries = await fs.promises.readdir(parentPath, { withFileTypes: true });
        return entries
            .filter(entry =>
                entry.isDirectory() &&
                !entry.name.startsWith('.') &&
                !entry.name.startsWith('node_modules')
            )
            .map(entry => ({
                name: entry.name,
                path: path.join(parentPath, entry.name)
            }));
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
    const subdirs = await getSubdirectories(vscode.workspace.workspaceFolders![0].uri.fsPath);

    const selection = await vscode.window.showInformationMessage(
        `This workspace contains ${subdirs.length} subdirectories:\n${subdirs.map(d => `• ${d.name}`).join('\n')}\n\nEnable Project Switcher to manage them as separate projects without losing sessions?`,
        { modal: true },
        'Enable Project Switcher',
        'Not Now'
    );

    return selection === 'Enable Project Switcher';
}

export async function enableProjectSwitcher(context: vscode.ExtensionContext) {
    // CRITICAL FIX: Update global state FIRST
    context.globalState.update('projectSwitcherEnabled', true);
    state.isProjectSwitcherEnabled = true; // Also update in-memory state

    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const subdirs = await getSubdirectories(workspaceRoot);

    Logger.info(`Enabling Project Switcher for ${subdirs.length} subdirectories`);

    // Clear existing projects first
    state.projects.length = 0;

    // Auto-create projects for ALL subdirectories (up to 9)
    const selectedPaths: string[] = [];
    for (let i = 0; i < Math.min(subdirs.length, 9); i++) {
        const subdir = subdirs[i];

        const project = createProject(subdir.name, subdir.path, `Project in ${subdir.name}`);
        project.order = i + 1;
        project.enabled = true; // Ensure all projects start as enabled
        selectedPaths.push(subdir.path);

        Logger.debug(`Created project: ${subdir.name} with order ${i + 1}`);
    }

    // Store selected project paths in workspace filter
    if (state.workspaceFilter) {
        await state.workspaceFilter.setSelectedProjects(selectedPaths);
    }

    saveProjects(context);

    // Set first project as current and enable filtering by default
    if (state.projects.length > 0) {
        const firstProject = state.projects[0];
        state.currentProjectId = firstProject.id;

        // AUTO-ENABLE filtering by default when Project Switcher is enabled
        if (state.workspaceFilter) {
            await state.workspaceFilter.enableProjectFiltering(firstProject.path);
            state.isProjectFilteringEnabled = true;
            Logger.info(`Auto-enabled filtering for first project: ${firstProject.name}`);
        }

        Logger.debug(`Set current project to: ${firstProject.name} with filtering enabled`);
    }
}

export function createProject(
    name: string,
    projectPath: string,
    description?: string
): ProjectConfig {
    const project: ProjectConfig = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name,
        path: projectPath,
        order: 0, // Will be set later
        description,
        lastUsed: Date.now(),
        sessionEnabled: true,
        enabled: true // Default to enabled
    };

    state.projects.push(project);
    Logger.info(`Created project: ${name}`);

    return project;
}

// FIXED: Restored project switching functionality
export async function switchToProject(projectId: string): Promise<boolean> {
    const project = getProjectById(projectId);
    if (!project) {
        Logger.error(`Project not found: ${projectId}`);
        return false;
    }

    // Check if project is enabled
    if (project.enabled === false) {
        vscode.window.showWarningMessage(`Project "${project.name}" is disabled`);
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

        // Save current project session first (BEFORE changing currentProjectId)
        if (state.currentProjectId && state.currentProjectId !== projectId) {
            const currentProject = getProjectById(state.currentProjectId);
            if (currentProject?.sessionEnabled !== false) {
                await saveCurrentProjectSession();
                Logger.debug('Saved current session before switching');
            }
        }

        // Update current project
        const previousProjectId = state.currentProjectId;
        state.currentProjectId = projectId;
        project.lastUsed = Date.now();

        // Enable filtering for the new project
        if (state.workspaceFilter) {
            await state.workspaceFilter.enableProjectFiltering(project.path);
            state.isProjectFilteringEnabled = true;
            Logger.debug(`Auto-enabled filtering for project: ${project.name}`);
        }

        // Close all editors first
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        // Delay to let filtering take effect
        await new Promise(resolve => setTimeout(resolve, 500));

        // Focus project directory in Explorer
        await focusProjectInExplorer(project.path);

        // Restore project session AFTER filtering and focusing
        if (project.sessionEnabled !== false) {
            const restored = await restoreProjectSession(projectId);
            if (!restored) {
                Logger.debug(`No session to restore for project: ${project.name}`);
            }
        }

        // Refresh tree views
        vscode.commands.executeCommand('project-switcher.refreshAllTrees');

        Logger.info(`Successfully switched to project: ${project.name} with filtering enabled`);

        // Show success message
        vscode.window.showInformationMessage(`Switched to: ${project.name}`);

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

async function restoreProjectSession(projectId: string): Promise<boolean> {
    const sessionManager = getSessionManager();
    if (sessionManager) {
        return await sessionManager.restoreSession(projectId);
    }
    return false;
}

async function focusProjectInExplorer(projectPath: string) {
    try {
        const uri = vscode.Uri.file(projectPath);
        await vscode.commands.executeCommand('revealInExplorer', uri);

        // Additional commands to focus the project folder
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');

        Logger.debug(`Focused project in explorer: ${projectPath}`);
    } catch (error) {
        Logger.warn('Failed to focus project in explorer', error);
    }
}

function getSessionManager() {
    return state.sessionManager;
}

export async function enableProjectSwitcherManually(context: vscode.ExtensionContext): Promise<boolean> {
    const workspaceMode = await detectWorkspaceMode();

    if (workspaceMode !== WorkspaceMode.ParentDirectory) {
        vscode.window.showWarningMessage('Project Switcher requires a parent directory with 2+ subdirectories');
        return false;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const subdirs = await getSubdirectories(workspaceRoot);

    if (subdirs.length === 0) {
        vscode.window.showWarningMessage('No subdirectories found to create projects from');
        return false;
    }

    // CRITICAL: Initialize workspace filter if not already available
    if (!state.workspaceFilter) {
        const WorkspaceFilter = require('./workspaceFilter').WorkspaceFilter;
        state.workspaceFilter = new WorkspaceFilter(context);
        Logger.debug('Initialized workspace filter for manual enable');
    }

    // Enable with all folders
    await enableProjectSwitcherWithAllFolders(context, subdirs);
    state.isProjectSwitcherEnabled = true;

    vscode.window.showInformationMessage(`Project Switcher enabled with ${subdirs.length} projects!`);
    return true;
}

async function enableProjectSwitcherWithAllFolders(context: vscode.ExtensionContext, allFolders: { name: string, path: string }[]) {
    // CRITICAL FIX: Update global state FIRST
    context.globalState.update('projectSwitcherEnabled', true);
    state.isProjectSwitcherEnabled = true; // Also update in-memory state

    Logger.info(`Enabling Project Switcher for ALL ${allFolders.length} folders`);

    // Clear existing projects first
    state.projects.length = 0;

    // Create projects for ALL folders (up to 9)
    const selectedPaths: string[] = [];
    const foldersToUse = allFolders.slice(0, 9); // Limit to 9 for keyboard shortcuts

    for (let i = 0; i < foldersToUse.length; i++) {
        const folder = foldersToUse[i];

        const project = createProject(folder.name, folder.path, `Project in ${folder.name}`);
        project.order = i + 1;
        project.enabled = true; // Ensure all projects start as enabled
        selectedPaths.push(folder.path);

        Logger.debug(`Created project: ${folder.name} with order ${i + 1}`);
    }

    // CRITICAL: Store selected project paths in workspace filter FIRST
    if (state.workspaceFilter) {
        await state.workspaceFilter.setSelectedProjects(selectedPaths);
        Logger.debug('Stored selected project paths in workspace filter');
    }

    saveProjects(context);

    // Set first project as current and AUTO-ENABLE filtering by default
    if (state.projects.length > 0) {
        const firstProject = state.projects[0];
        state.currentProjectId = firstProject.id;

        // FIXED: Ensure workspace filter is properly initialized before enabling filtering
        if (state.workspaceFilter) {
            // Store original configuration first if not already done
            await state.workspaceFilter.storeOriginalConfiguration();
            Logger.debug('Stored original workspace configuration');

            // Now enable filtering for the first project
            await state.workspaceFilter.enableProjectFiltering(firstProject.path);
            state.isProjectFilteringEnabled = true;

            Logger.info(`Auto-enabled filtering for first project: ${firstProject.name}`);

            // Verify that filtering was applied
            const filterStatus = state.workspaceFilter.getFilteringStatus();
            Logger.debug('Filter status after enabling:', filterStatus);

            // Force refresh explorer to show only the first project
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

            // Second refresh after delay to ensure filtering is visible
            setTimeout(async () => {
                await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
                Logger.debug('Secondary refresh after enabling filtering');
            }, 500);
        } else {
            Logger.error('Workspace filter not available when enabling Project Switcher');
        }

        Logger.debug(`Set current project to: ${firstProject.name} with filtering enabled`);
    }
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
        'This will disable Project Switcher and show all folders again. Continue?',
        { modal: true },
        'Disable'
    );

    if (confirm === 'Disable') {
        try {
            // CRITICAL FIX: Update global state FIRST
            context.globalState.update('projectSwitcherEnabled', false);
            state.isProjectSwitcherEnabled = false; // Also update in-memory state

            // CRITICAL: Disable filtering FIRST before clearing other state
            if (state.workspaceFilter) {
                await state.workspaceFilter.disableProjectFiltering();
                Logger.info('Disabled project filtering');
            }

            // THEN restore original workspace configuration
            if (state.workspaceFilter) {
                await state.workspaceFilter.restoreOriginalConfiguration();
                Logger.info('Restored original workspace configuration');
            }

            // Clear all project data
            state.projects.length = 0;
            state.currentProjectId = undefined;
            state.sessions.clear();
            state.isProjectFilteringEnabled = false;

            // Clear workspace filter reference
            state.workspaceFilter = undefined;

            // Save cleared projects
            saveProjects(context);

            // Force refresh file explorer to ensure all folders are visible
            await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

            // Small delay then another refresh to ensure visibility
            setTimeout(async () => {
                await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
                Logger.info('Secondary explorer refresh completed');
            }, 500);

            vscode.window.showInformationMessage('Project Switcher disabled. All folders are now visible.');
            Logger.info('Project Switcher disabled by user, all folders restored');

        } catch (error) {
            Logger.error('Failed to disable Project Switcher completely', error);
            vscode.window.showErrorMessage(`Failed to disable Project Switcher: ${error}`);
        }
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
    const enabledProjects = state.projects.filter(p => p.enabled !== false);
    const usedOrders = new Set(enabledProjects.map(p => p.order));

    for (let i = 1; i <= 9; i++) {
        if (!usedOrders.has(i)) {
            return i;
        }
    }

    return null; // All slots 1-9 are taken
}

// NEW: Get the next order number for re-enabling a project
export function getNextOrderForReEnable(): number {
    const enabledProjects = state.projects.filter(p => p.enabled !== false);
    if (enabledProjects.length === 0) {
        return 1; // First project
    }

    // Find the highest order among enabled projects and add 1
    const maxOrder = Math.max(...enabledProjects.map(p => p.order));
    return Math.min(maxOrder + 1, 9); // Cap at 9 for keyboard shortcuts
}