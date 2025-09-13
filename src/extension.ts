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
        const treeDataProvider = new ProjectTreeDataProvider();
        const treeView = vscode.window.createTreeView('projectManager', {
            treeDataProvider,
            showCollapseAll: false
        });

        // Register all commands
        registerAllCommands(context, treeDataProvider, sessionManager);

        // Update UI
        updateStatusBar();

        // Setup auto-save on tab changes
        setupAutoSave(sessionManager);

    } else if (state.workspaceMode === WorkspaceMode.ParentDirectory) {
        // Show option to enable in status bar
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        statusBarItem.text = '$(folder) Enable Project Switcher';
        statusBarItem.tooltip = 'Click to enable Project Switcher for this workspace';
        statusBarItem.command = 'project-switcher.enable';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Register enable command
        const enableCommand = vscode.commands.registerCommand('project-switcher.enable', async () => {
            const enabled = await initializeProjectSwitcher(context);
            if (enabled) {
                statusBarItem.dispose();
                // Re-activate with full functionality
                await activate(context);
            }
        });
        context.subscriptions.push(enableCommand);
    }

    state.isInitialized = true;
    Logger.info('Project Switcher extension fully initialized');
}

function setupAutoSave(sessionManager: SessionManager) {
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