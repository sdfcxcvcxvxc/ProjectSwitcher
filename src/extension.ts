// src/extension.ts - Fixed Activity Bar visibility issue
import * as vscode from 'vscode';
import { state, WorkspaceMode } from './models/models';
import { initializeProjectSwitcher, loadProjects } from './utils/projectUtils';
import { ProjectTreeDataProvider } from './providers/projectTreeDataProvider';
import { AllProjectsTreeDataProvider } from './providers/allProjectsTreeDataProvider';
import { registerAllCommands } from './commands';
import { SessionManager } from './utils/sessionManager';
import { WorkspaceFilter } from './utils/workspaceFilter';
import { Logger } from './utils/logger';

export async function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.info('Project Switcher extension activated');

    // CRITICAL FIX: Always show activity bar icon immediately, regardless of workspace mode
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

    Logger.info(`Workspace mode: ${state.workspaceMode}`);
    Logger.info(`Project Switcher auto-enabled: ${isAutoEnabled}`);

    // Handle different workspace modes
    if (isAutoEnabled) {
        // Project Switcher is fully enabled
        await setupEnabledMode(context, workspaceFilter, sessionManager, projectTreeDataProvider, allProjectsTreeDataProvider);
    } else {
        // Show the extension but in "ready to enable" state
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

    // Create status bar item
    state.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    state.statusBarItem.command = 'project-switcher.showProjectMenu';
    context.subscriptions.push(state.statusBarItem);

    // Update UI
    updateStatusBar();

    // Setup auto-save on tab changes
    const autoSaveSubscriptions = setupAutoSave(sessionManager);
    autoSaveSubscriptions.forEach(sub => context.subscriptions.push(sub));

    // Setup tree refresh listeners
    const refreshBothTrees = () => {
        projectTreeDataProvider.refresh();
        allProjectsTreeDataProvider.refresh();
    };

    // Refresh trees when projects change
    context.subscriptions.push(
        vscode.commands.registerCommand('project-switcher.refreshAllTrees', refreshBothTrees)
    );
}

// FIXED: Setup for when extension is ready but not enabled
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

    // Create a subtle status bar hint only for parent directory workspaces
    if (state.workspaceMode === WorkspaceMode.ParentDirectory) {
        const enableHintItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        enableHintItem.text = '$(folder) Enable Project Switcher';
        enableHintItem.tooltip = 'Click to enable Project Switcher for this workspace';
        enableHintItem.command = 'project-switcher.enable';
        enableHintItem.show();
        context.subscriptions.push(enableHintItem);

        // Register enable command
        const enableCommand = vscode.commands.registerCommand('project-switcher.enable', async () => {
            const enabled = await initializeProjectSwitcher(context);
            if (enabled) {
                enableHintItem.dispose();
                // Switch to full mode
                await activateFullMode(context, projectTreeDataProvider, allProjectsTreeDataProvider, sessionManager);
            }
        });
        context.subscriptions.push(enableCommand);
    }

    // Setup tree refresh command
    const refreshCommand = vscode.commands.registerCommand('project-switcher.refreshAllTrees', () => {
        projectTreeDataProvider.refresh();
        allProjectsTreeDataProvider.refresh();
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
    // IMPORTANT: Don't change the context here - keep activity bar visible

    // Store original workspace configuration
    if (state.workspaceFilter) {
        await state.workspaceFilter.storeOriginalConfiguration();
    }

    // Create status bar item
    state.statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    state.statusBarItem.command = 'project-switcher.showProjectMenu';
    context.subscriptions.push(state.statusBarItem);

    // Update UI
    projectTreeDataProvider.refresh();
    allProjectsTreeDataProvider.refresh();
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

export function deactivate() {
    // Restore original configuration before deactivating
    if (state.workspaceFilter) {
        state.workspaceFilter.restoreOriginalConfiguration();
    }

    // Save current session before deactivating
    if (state.currentProjectId && state.sessionManager) {
        state.sessionManager.saveCurrentSession();
    }

    // FIXED: Don't clear the context here - let VS Code handle it
    // The activity bar should remain available

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