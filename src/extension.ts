// src/extension.ts - Fixed context management and proper statusbar handling
import * as vscode from 'vscode';
import { state, WorkspaceMode } from './models/models';
import { initializeProjectSwitcher, loadProjects } from './utils/projectUtils';
import { ProjectTreeDataProvider } from './providers/projectTreeDataProvider';
import { AllProjectsTreeDataProvider } from './providers/allProjectsTreeDataProvider';
import { registerAllCommands } from './commands';
import { SessionManager } from './utils/sessionManager';
import { WorkspaceFilter } from './utils/workspaceFilter';
import { Logger } from './utils/logger';
import { createStatusBarItem, updateStatusBar } from './utils/statusBarUtils';

export async function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.info('Project Switcher extension activated');

    // Always show activity bar icon immediately
    await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', true);
    Logger.info('Set context projectSwitcher.isEnabled to true (always visible)');

    // Initialize session manager
    const sessionManager = new SessionManager(context);
    state.sessionManager = sessionManager;

    // Initialize workspace filter
    const workspaceFilter = new WorkspaceFilter(context);
    state.workspaceFilter = workspaceFilter;

    // Load existing projects
    loadProjects(context);

    // Create both tree data providers immediately
    const projectTreeDataProvider = new ProjectTreeDataProvider();
    const allProjectsTreeDataProvider = new AllProjectsTreeDataProvider();

    // Always create tree views
    Logger.info('Creating tree views...');
    try {
        const projectTreeView = vscode.window.createTreeView('projectManager', {
            treeDataProvider: projectTreeDataProvider,
            showCollapseAll: false
        });
        context.subscriptions.push(projectTreeView);
        Logger.info('Project Manager tree view created successfully');

        const allProjectsTreeView = vscode.window.createTreeView('allProjects', {
            treeDataProvider: allProjectsTreeDataProvider,
            showCollapseAll: false
        });
        context.subscriptions.push(allProjectsTreeView);
        Logger.info('All Projects tree view created successfully');

    } catch (error) {
        Logger.error('Failed to create tree views', error);
    }

    // Register all commands immediately
    registerAllCommands(context, projectTreeDataProvider, sessionManager, allProjectsTreeDataProvider);

    // Detect workspace mode and initialize if needed
    const isAutoEnabled = await initializeProjectSwitcher(context);
    state.isProjectSwitcherEnabled = isAutoEnabled;

    // Set contexts for UI visibility
    await updateContexts();

    Logger.info(`Workspace mode: ${state.workspaceMode}`);
    Logger.info(`Project Switcher auto-enabled: ${isAutoEnabled}`);

    // Handle different workspace modes
    if (isAutoEnabled) {
        await setupEnabledMode(context, workspaceFilter, sessionManager, projectTreeDataProvider, allProjectsTreeDataProvider);
    } else {
        await setupReadyMode(context, projectTreeDataProvider, allProjectsTreeDataProvider, sessionManager);
    }

    state.isInitialized = true;
    Logger.info('Project Switcher extension fully initialized');

    // Force refresh Activity Bar after initialization
    setTimeout(async () => {
        try {
            await vscode.commands.executeCommand('workbench.view.extension.project-switcher');
            Logger.info('Successfully opened Project Switcher activity bar');
        } catch (error) {
            Logger.debug('Could not auto-open activity bar (this is normal)', error);
        }
    }, 1000);
}

// Update VS Code contexts based on state
async function updateContexts() {
    await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', state.isProjectSwitcherEnabled);
    await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects',
        state.isProjectSwitcherEnabled && state.projects.length > 1);
    Logger.debug(`Updated contexts: isEnabled=${state.isProjectSwitcherEnabled}, hasMultipleProjects=${state.isProjectSwitcherEnabled && state.projects.length > 1}`);
}

// Setup for fully enabled Project Switcher mode
async function setupEnabledMode(
    context: vscode.ExtensionContext,
    workspaceFilter: WorkspaceFilter,
    sessionManager: SessionManager,
    projectTreeDataProvider: ProjectTreeDataProvider,
    allProjectsTreeDataProvider: AllProjectsTreeDataProvider
) {
    // Store original workspace configuration
    await workspaceFilter.storeOriginalConfiguration();

    // Restore filtering state if it was previously enabled
    await workspaceFilter.restoreFilteringState();

    Logger.info('Project Switcher enabled for parent directory workspace');

    // Create and show status bar item immediately
    createStatusBarItem(context);
    updateStatusBar();

    // Setup auto-save on tab changes
    const autoSaveSubscriptions = setupAutoSave(sessionManager);
    autoSaveSubscriptions.forEach(sub => context.subscriptions.push(sub));

    // Setup tree refresh listeners with context updates
    const refreshBothTrees = async () => {
        projectTreeDataProvider.refresh();
        allProjectsTreeDataProvider.refresh();
        await updateContexts();
    };

    // Refresh trees when projects change
    context.subscriptions.push(
        vscode.commands.registerCommand('project-switcher.refreshAllTrees', refreshBothTrees)
    );
}

async function setupReadyMode(
    context: vscode.ExtensionContext,
    projectTreeDataProvider: ProjectTreeDataProvider,
    allProjectsTreeDataProvider: AllProjectsTreeDataProvider,
    sessionManager: SessionManager
) {
    Logger.info('Project Switcher in ready mode - can be enabled manually');

    // Show helpful message in tree view
    projectTreeDataProvider.refresh();
    allProjectsTreeDataProvider.refresh();

    // Don't create conflicting statusbar items in ready mode
    if (state.workspaceMode === WorkspaceMode.ParentDirectory) {
        Logger.debug('Parent directory detected - ready for manual enabling');
    }

    // Setup tree refresh command with context updates
    const refreshCommand = vscode.commands.registerCommand('project-switcher.refreshAllTrees', async () => {
        projectTreeDataProvider.refresh();
        allProjectsTreeDataProvider.refresh();
        await updateContexts();
    });
    context.subscriptions.push(refreshCommand);
}

async function activateFullMode(
    context: vscode.ExtensionContext,
    projectTreeDataProvider: ProjectTreeDataProvider,
    allProjectsTreeDataProvider: AllProjectsTreeDataProvider,
    sessionManager: SessionManager
) {
    Logger.info('Activating full Project Switcher mode');

    state.isProjectSwitcherEnabled = true;
    await updateContexts();

    // Store original workspace configuration
    if (state.workspaceFilter) {
        await state.workspaceFilter.storeOriginalConfiguration();
    }

    // Create status bar item when activating
    createStatusBarItem(context);
    updateStatusBar();

    // Update UI
    projectTreeDataProvider.refresh();
    allProjectsTreeDataProvider.refresh();

    // Setup auto-save on tab changes
    const autoSaveSubscriptions = setupAutoSave(sessionManager);
    autoSaveSubscriptions.forEach(sub => context.subscriptions.push(sub));

    Logger.info('Full Project Switcher mode activated');
}

function setupAutoSave(sessionManager: SessionManager): vscode.Disposable[] {
    // Save session when switching between tabs
    const tabChangeHandler = vscode.window.onDidChangeActiveTextEditor(() => {
        if (state.currentProjectId) {
            sessionManager.saveCurrentSession();
        }
    });

    // Save session periodically when editing
    let saveTimeout: NodeJS.Timeout;
    const documentChangeHandler = vscode.workspace.onDidChangeTextDocument(() => {
        if (state.currentProjectId) {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                sessionManager.saveCurrentSession();
            }, 2000);
        }
    });

    return [tabChangeHandler, documentChangeHandler];
}

export function deactivate() {
    // Restore original configuration before deactivating
    if (state.workspaceFilter) {
        state.workspaceFilter.restoreOriginalConfiguration();
    }

    // Save current session before deactivating
    if (state.currentProjectId && state.sessionManager) {
        state.sessionManager.saveCurrentSession();
    }

    // Cleanup
    state.projects.length = 0;
    state.sessions.clear();
    state.currentProjectId = undefined;
    state.isInitialized = false;
    state.isProjectSwitcherEnabled = false;
    state.isProjectFilteringEnabled = false;
    state.workspaceFilter = undefined;

    Logger.dispose();
}