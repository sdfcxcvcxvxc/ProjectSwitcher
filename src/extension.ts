import * as vscode from 'vscode';
import { state, WorkspaceMode } from './models/models';
import { initializeProjectSwitcher, loadProjects } from './utils/projectUtils';
import { ProjectTreeDataProvider } from './providers/projectTreeDataProvider';
import { registerAllCommands } from './commands';
import { SessionManager } from './utils/sessionManager';
import { Logger } from './utils/logger';

export async function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.info('Project Switcher extension activated');

    // Initialize session manager
    const sessionManager = new SessionManager(context);
    state.sessionManager = sessionManager;

    // Load existing projects
    loadProjects(context);

    // Create tree data provider first
    const treeDataProvider = new ProjectTreeDataProvider();

    // Detect workspace mode and initialize if needed
    const isEnabled = await initializeProjectSwitcher(context);
    state.isProjectSwitcherEnabled = isEnabled;

    if (isEnabled) {
        Logger.info('Project Switcher enabled for parent directory workspace');

        // Create status bar item
        state.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        state.statusBarItem.command = 'project-switcher.showProjectMenu';
        context.subscriptions.push(state.statusBarItem);

        // Create tree view
        const treeView = vscode.window.createTreeView('projectManager', {
            treeDataProvider,
            showCollapseAll: false
        });
        context.subscriptions.push(treeView);

        // Update UI
        updateStatusBar();

        // Setup auto-save on tab changes
        const autoSaveSubscriptions = setupAutoSave(sessionManager);
        autoSaveSubscriptions.forEach(sub => context.subscriptions.push(sub));

    } else if (state.workspaceMode === WorkspaceMode.ParentDirectory) {
        // Show option to enable in status bar
        const enableStatusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        enableStatusBarItem.text = '$(folder) Enable Project Switcher';
        enableStatusBarItem.tooltip = 'Click to enable Project Switcher for this workspace';
        enableStatusBarItem.command = 'project-switcher.enable';
        enableStatusBarItem.show();
        context.subscriptions.push(enableStatusBarItem);

        // Register enable command
        const enableCommand = vscode.commands.registerCommand('project-switcher.enable', async () => {
            const enabled = await initializeProjectSwitcher(context);
            if (enabled) {
                enableStatusBarItem.dispose();
                // Re-activate with full functionality
                await activateFullMode(context, treeDataProvider, sessionManager);
            }
        });
        context.subscriptions.push(enableCommand);
    }

    // Always register all commands (even when disabled)
    registerAllCommands(context, treeDataProvider, sessionManager);

    state.isInitialized = true;
    Logger.info('Project Switcher extension fully initialized');
}

async function activateFullMode(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    Logger.info('Activating full Project Switcher mode');

    state.isProjectSwitcherEnabled = true;

    // Create status bar item
    state.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    state.statusBarItem.command = 'project-switcher.showProjectMenu';
    context.subscriptions.push(state.statusBarItem);

    // Create tree view
    const treeView = vscode.window.createTreeView('projectManager', {
        treeDataProvider,
        showCollapseAll: false
    });
    context.subscriptions.push(treeView);

    // Update UI
    treeDataProvider.refresh();
    updateStatusBar();

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

function updateStatusBar() {
    if (!state.statusBarItem) return;

    if (state.currentProjectId) {
        const project = state.projects.find(p => p.id === state.currentProjectId);
        if (project) {
            state.statusBarItem.text = `$(folder) ${project.name} [${project.order}]`;
            state.statusBarItem.tooltip = `Current project: ${project.name}\nPath: ${project.path}\nShortcut: Ctrl+Alt+${project.order}\nClick to switch project`;
            state.statusBarItem.show();
            return;
        }
    }

    state.statusBarItem.text = `$(folder) No Project`;
    state.statusBarItem.tooltip = 'No project selected. Click to manage projects.';
    state.statusBarItem.show();
}

export function deactivate() {
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

    Logger.dispose();
}