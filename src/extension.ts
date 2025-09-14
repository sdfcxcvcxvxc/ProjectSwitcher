// src/extension.ts - Updated with context management for conditional disable functionality
import * as vscode from 'vscode';
import { state, WorkspaceMode } from './models/models';
import { initializeProjectSwitcher, loadProjects } from './utils/projectUtils';
import { ProjectTreeDataProvider } from './providers/projectTreeDataProvider';
import { AllProjectsTreeDataProvider } from './providers/allProjectsTreeDataProvider';
import { registerAllCommands } from './commands';
import { OptimizedSessionManager } from './utils/optimizedSessionManager';
import { WorkspaceFilter } from './utils/workspaceFilter';
import { Logger } from './utils/logger';

export async function activate(context: vscode.ExtensionContext) {
    Logger.initialize();
    Logger.info('Project Switcher extension activated with optimized session management (no status bar)');

    // Always show activity bar icon immediately
    await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', true);

    // Initialize optimized session manager
    const sessionManager = new OptimizedSessionManager(context);
    state.sessionManager = sessionManager;

    // Initialize workspace filter
    const workspaceFilter = new WorkspaceFilter(context);
    state.workspaceFilter = workspaceFilter;

    // Load existing projects
    loadProjects(context);

    // Create both tree data providers
    const projectTreeDataProvider = new ProjectTreeDataProvider();
    const allProjectsTreeDataProvider = new AllProjectsTreeDataProvider();

    // Create tree views
    try {
        const projectTreeView = vscode.window.createTreeView('projectManager', {
            treeDataProvider: projectTreeDataProvider,
            showCollapseAll: false
        });
        context.subscriptions.push(projectTreeView);

        const allProjectsTreeView = vscode.window.createTreeView('allProjects', {
            treeDataProvider: allProjectsTreeDataProvider,
            showCollapseAll: false
        });
        context.subscriptions.push(allProjectsTreeView);

    } catch (error) {
        Logger.error('Failed to create tree views', error);
    }

    // Register all commands with optimized session manager
    registerAllCommands(context, projectTreeDataProvider, sessionManager, allProjectsTreeDataProvider);

    // Detect workspace mode and initialize
    const isAutoEnabled = await initializeProjectSwitcher(context);
    state.isProjectSwitcherEnabled = isAutoEnabled;

    // Set contexts for UI visibility
    await updateContexts();

    // Handle different workspace modes
    if (isAutoEnabled) {
        await setupEnabledMode(context, workspaceFilter, sessionManager, projectTreeDataProvider, allProjectsTreeDataProvider);
    } else {
        await setupReadyMode(context, projectTreeDataProvider, allProjectsTreeDataProvider, sessionManager);
    }

    state.isInitialized = true;
    Logger.info('Project Switcher extension fully initialized with optimizations (no status bar)');

    // Show performance tip for users with many tabs
    setTimeout(async () => {
        if (state.isProjectSwitcherEnabled && state.projects.length > 0) {
            let totalTabs = 0;
            for (const project of state.projects) {
                totalTabs += await sessionManager.getProjectTabCount(project.id);
            }

            if (totalTabs > 100) {
                vscode.window.showInformationMessage(
                    `Project Switcher detected ${totalTabs} total tabs across projects. Using optimized tab management for smooth switching.`,
                    'Learn More'
                ).then(selection => {
                    if (selection === 'Learn More') {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/KhanhRomVN/ProjectSwitcher#performance'));
                    }
                });
            }
        }
    }, 3000);
}

// NEW: Enhanced context update with conditional disable support
async function updateContexts() {
    await vscode.commands.executeCommand('setContext', 'projectSwitcher.isEnabled', state.isProjectSwitcherEnabled);
    await vscode.commands.executeCommand('setContext', 'projectSwitcher.hasMultipleProjects',
        state.isProjectSwitcherEnabled && state.projects.length > 1);

    // NEW: Set context for conditional disable functionality
    const enabledProjects = state.projects.filter(p => p.enabled !== false);
    const canDisableProjects = enabledProjects.length > 2; // Only allow disable when 3+ projects are enabled
    await vscode.commands.executeCommand('setContext', 'projectSwitcher.canDisableProjects', canDisableProjects);

    Logger.debug(`Updated contexts - enabled: ${state.isProjectSwitcherEnabled}, multiple: ${state.projects.length > 1}, canDisable: ${canDisableProjects} (${enabledProjects.length} enabled projects)`);
}

async function setupEnabledMode(
    context: vscode.ExtensionContext,
    workspaceFilter: WorkspaceFilter,
    sessionManager: OptimizedSessionManager,
    projectTreeDataProvider: ProjectTreeDataProvider,
    allProjectsTreeDataProvider: AllProjectsTreeDataProvider
) {
    await workspaceFilter.storeOriginalConfiguration();
    await workspaceFilter.restoreFilteringState();

    Logger.info('Project Switcher enabled with optimized session management (no status bar)');

    // Setup optimized auto-save with batching
    const autoSaveSubscriptions = setupOptimizedAutoSave(sessionManager);
    autoSaveSubscriptions.forEach(sub => context.subscriptions.push(sub));

    // Enhanced refresh function that updates contexts
    const refreshBothTrees = async () => {
        projectTreeDataProvider.refresh();
        allProjectsTreeDataProvider.refresh();
        await updateContexts(); // NEW: Update contexts on refresh
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('project-switcher.refreshAllTrees', refreshBothTrees)
    );

    // NEW: Listen for project state changes to update contexts
    const originalSaveProjects = require('./utils/projectUtils').saveProjects;
    // This would ideally be done through an event system, but for now we'll update contexts in the command handlers
}

async function setupReadyMode(
    context: vscode.ExtensionContext,
    projectTreeDataProvider: ProjectTreeDataProvider,
    allProjectsTreeDataProvider: AllProjectsTreeDataProvider,
    sessionManager: OptimizedSessionManager
) {
    Logger.info('Project Switcher in ready mode with optimized session management (no status bar)');

    projectTreeDataProvider.refresh();
    allProjectsTreeDataProvider.refresh();

    // Enhanced refresh command that updates contexts
    const refreshCommand = vscode.commands.registerCommand('project-switcher.refreshAllTrees', async () => {
        projectTreeDataProvider.refresh();
        allProjectsTreeDataProvider.refresh();
        await updateContexts(); // NEW: Update contexts on refresh
    });
    context.subscriptions.push(refreshCommand);
}

function setupOptimizedAutoSave(sessionManager: OptimizedSessionManager): vscode.Disposable[] {
    let saveTimeout: NodeJS.Timeout;
    let pendingSave = false;

    // Debounced save function to prevent excessive saves
    const debouncedSave = () => {
        if (pendingSave) return;

        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            if (state.currentProjectId) {
                pendingSave = true;
                try {
                    await sessionManager.saveCurrentSession();
                } catch (error) {
                    Logger.warn('Auto-save failed', error);
                } finally {
                    pendingSave = false;
                }
            }
        }, 3000); // Increased debounce time for better performance
    };

    // Save on significant events
    const tabChangeHandler = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (state.currentProjectId && editor) {
            debouncedSave();
        }
    });

    // Save on document changes but less frequently
    const documentChangeHandler = vscode.workspace.onDidChangeTextDocument(() => {
        if (state.currentProjectId) {
            debouncedSave();
        }
    });

    // Save when tabs are closed/moved
    const tabGroupsHandler = vscode.window.tabGroups.onDidChangeTabs(() => {
        if (state.currentProjectId) {
            debouncedSave();
        }
    });

    // Save when VS Code loses focus (user might be switching apps)
    const windowFocusHandler = vscode.window.onDidChangeWindowState((windowState) => {
        if (!windowState.focused && state.currentProjectId) {
            // Immediate save when losing focus
            clearTimeout(saveTimeout);
            sessionManager.saveCurrentSession().catch(error => {
                Logger.warn('Focus-based save failed', error);
            });
        }
    });

    return [tabChangeHandler, documentChangeHandler, tabGroupsHandler, windowFocusHandler];
}

// NEW: Export updateContexts function for use in commands
export { updateContexts };

export function deactivate() {
    // Save current session before deactivating
    if (state.currentProjectId && state.sessionManager) {
        try {
            // Force synchronous save on deactivation
            state.sessionManager.saveCurrentSession();
        } catch (error) {
            Logger.warn('Failed to save session during deactivation', error);
        }
    }

    // Restore original configuration
    if (state.workspaceFilter) {
        try {
            state.workspaceFilter.restoreOriginalConfiguration();
        } catch (error) {
            Logger.warn('Failed to restore workspace filter during deactivation', error);
        }
    }

    // Dispose optimized session manager
    if (state.sessionManager && typeof state.sessionManager.dispose === 'function') {
        state.sessionManager.dispose();
    }

    // Cleanup state (no status bar disposal needed)
    state.projects.length = 0;
    state.sessions.clear();
    state.currentProjectId = undefined;
    state.isInitialized = false;
    state.isProjectSwitcherEnabled = false;
    state.isProjectFilteringEnabled = false;
    state.workspaceFilter = undefined;
    state.sessionManager = undefined;

    Logger.dispose();
}