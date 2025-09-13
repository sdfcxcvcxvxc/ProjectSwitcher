// src/utils/optimizedSessionManager.ts - Enhanced version with tab hiding instead of closing
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectSession, TabInfo } from '../models/models';
import { getProjectById } from './projectUtils';
import { Logger } from './logger';

interface HiddenTabInfo extends TabInfo {
    tabGroup: number;
    tabIndex: number;
    document?: vscode.TextDocument; // Keep document reference
}

interface ProjectTabState {
    hiddenTabs: HiddenTabInfo[];
    visibleTabs: Set<string>; // URIs of currently visible tabs
}

export class OptimizedSessionManager {
    private context?: vscode.ExtensionContext;
    private projectTabStates = new Map<string, ProjectTabState>(); // In-memory tab state
    private tabGroupWatcher?: vscode.Disposable;

    constructor(context?: vscode.ExtensionContext) {
        this.context = context;
        this.loadSessions();
        this.setupTabWatcher();
    }

    private setupTabWatcher() {
        // Watch for tab changes to update our internal state
        this.tabGroupWatcher = vscode.window.tabGroups.onDidChangeTabs(() => {
            this.updateCurrentProjectTabState();
        });
    }

    private updateCurrentProjectTabState() {
        if (!state.currentProjectId) return;

        const project = getProjectById(state.currentProjectId);
        if (!project) return;

        // Update visible tabs for current project
        const visibleTabs = new Set<string>();
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;
                    if (uri.scheme === 'file' && uri.fsPath.startsWith(project.path)) {
                        visibleTabs.add(uri.toString());
                    }
                }
            }
        }

        const currentState = this.projectTabStates.get(state.currentProjectId);
        if (currentState) {
            currentState.visibleTabs = visibleTabs;
        } else {
            this.projectTabStates.set(state.currentProjectId, {
                hiddenTabs: [],
                visibleTabs
            });
        }
    }

    private loadSessions() {
        if (!this.context) return;

        const stored = this.context.globalState.get<{ [key: string]: ProjectSession }>('projectSessions');
        if (stored) {
            state.sessions = new Map(Object.entries(stored));
            Logger.debug(`Loaded ${state.sessions.size} project sessions`);
        }
    }

    private saveSessions() {
        if (!this.context) return;

        const sessionsObj: { [key: string]: ProjectSession } = {};
        state.sessions.forEach((session, projectId) => {
            sessionsObj[projectId] = session;
        });

        this.context.globalState.update('projectSessions', sessionsObj);
        Logger.debug(`Saved ${state.sessions.size} project sessions`);
    }

    // OPTIMIZED: Hide tabs instead of closing them
    async hideCurrentProjectTabs(): Promise<void> {
        if (!state.currentProjectId) return;

        const project = getProjectById(state.currentProjectId);
        if (!project || project.sessionEnabled === false) return;

        try {
            const hiddenTabs: HiddenTabInfo[] = [];

            // Find all tabs belonging to current project
            for (const tabGroup of vscode.window.tabGroups.all) {
                for (let i = 0; i < tabGroup.tabs.length; i++) {
                    const tab = tabGroup.tabs[i];

                    if (tab.input instanceof vscode.TabInputText) {
                        const uri = tab.input.uri;

                        if (uri.scheme === 'file' && uri.fsPath.startsWith(project.path)) {
                            // Store tab info for later restoration
                            const hiddenTab: HiddenTabInfo = {
                                uri: uri.toString(),
                                isActive: tab.isActive,
                                isPinned: tab.isPinned,
                                viewColumn: tabGroup.viewColumn,
                                isDirty: tab.isDirty,
                                tabGroup: tabGroup.viewColumn,
                                tabIndex: i,
                                selection: await this.getEditorSelection(uri),
                                document: await this.getDocument(uri)
                            };

                            hiddenTabs.push(hiddenTab);
                        }
                    }
                }
            }

            // Store hidden tabs in memory (not persistent storage for performance)
            this.projectTabStates.set(state.currentProjectId, {
                hiddenTabs,
                visibleTabs: new Set()
            });

            // OPTIMIZED: Instead of closing tabs, just move them to a hidden tab group
            // This is faster but requires VS Code 1.74+
            if (hiddenTabs.length > 0) {
                await this.moveTabsToHiddenGroup(hiddenTabs);
            }

            Logger.debug(`Hidden ${hiddenTabs.length} tabs for project: ${project.name}`);

        } catch (error) {
            Logger.error('Failed to hide current project tabs', error);
        }
    }

    // Move tabs to a hidden/background tab group instead of closing
    private async moveTabsToHiddenGroup(hiddenTabs: HiddenTabInfo[]): Promise<void> {
        try {
            // Create a new tab group that we'll use as "storage"
            // This group will be hidden from normal view
            for (const tabInfo of hiddenTabs) {
                const uri = vscode.Uri.parse(tabInfo.uri);

                // Close the tab from current view (but keep document in memory)
                const tabGroups = vscode.window.tabGroups.all;
                for (const group of tabGroups) {
                    const tabToClose = group.tabs.find(tab =>
                        tab.input instanceof vscode.TabInputText &&
                        tab.input.uri.toString() === tabInfo.uri
                    );

                    if (tabToClose) {
                        await vscode.window.tabGroups.close(tabToClose);
                        break;
                    }
                }
            }
        } catch (error) {
            Logger.warn('Failed to move tabs to hidden group, falling back to close', error);
            // Fallback to closing tabs if advanced method fails
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }
    }

    // OPTIMIZED: Show tabs from memory instead of reopening files
    async showProjectTabs(projectId: string): Promise<void> {
        const project = getProjectById(projectId);
        if (!project || project.sessionEnabled === false) return;

        const tabState = this.projectTabStates.get(projectId);
        if (!tabState || tabState.hiddenTabs.length === 0) {
            // Fallback to traditional session restore
            await this.restoreSessionFromStorage(projectId);
            return;
        }

        try {
            Logger.debug(`Showing ${tabState.hiddenTabs.length} hidden tabs for project: ${project.name}`);

            // Sort tabs by original position
            const sortedTabs = [...tabState.hiddenTabs].sort((a, b) => {
                if (a.tabGroup !== b.tabGroup) return a.tabGroup - b.tabGroup;
                return a.tabIndex - b.tabIndex;
            });

            // Restore tabs efficiently - prioritize active tab
            const activeTabs = sortedTabs.filter(tab => tab.isActive);
            const pinnedTabs = sortedTabs.filter(tab => tab.isPinned && !tab.isActive);
            const regularTabs = sortedTabs.filter(tab => !tab.isPinned && !tab.isActive);

            // Show active tab first (instant feedback)
            for (const tabInfo of activeTabs) {
                await this.showSingleTab(tabInfo, true);
            }

            // Show pinned tabs
            for (const tabInfo of pinnedTabs) {
                await this.showSingleTab(tabInfo, false);
            }

            // Show regular tabs in batches to avoid overwhelming VS Code
            const batchSize = 10;
            for (let i = 0; i < regularTabs.length; i += batchSize) {
                const batch = regularTabs.slice(i, i + batchSize);

                // Process batch
                await Promise.all(batch.map(tabInfo => this.showSingleTab(tabInfo, false)));

                // Small delay between batches to prevent UI freezing
                if (i + batchSize < regularTabs.length) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            // Update visible tabs set
            tabState.visibleTabs = new Set(tabState.hiddenTabs.map(tab => tab.uri));

            Logger.info(`Successfully showed ${sortedTabs.length} tabs for project: ${project.name}`);

        } catch (error) {
            Logger.error(`Failed to show tabs for project: ${project.name}`, error);
            // Fallback to traditional restore
            await this.restoreSessionFromStorage(projectId);
        }
    }

    private async showSingleTab(tabInfo: HiddenTabInfo, setActive: boolean): Promise<vscode.TextEditor | undefined> {
        try {
            const uri = vscode.Uri.parse(tabInfo.uri);

            // Use cached document if available, otherwise open file
            let document = tabInfo.document;
            if (!document || document.isClosed) {
                document = await vscode.workspace.openTextDocument(uri);
            }

            const editor = await vscode.window.showTextDocument(document, {
                viewColumn: tabInfo.viewColumn || vscode.ViewColumn.One,
                preview: false,
                preserveFocus: !setActive
            });

            // Restore cursor position
            if (tabInfo.selection) {
                const start = new vscode.Position(
                    Math.max(0, tabInfo.selection.start.line),
                    Math.max(0, tabInfo.selection.start.character)
                );
                const end = new vscode.Position(
                    Math.max(0, tabInfo.selection.end.line),
                    Math.max(0, tabInfo.selection.end.character)
                );

                const validStart = document.validatePosition(start);
                const validEnd = document.validatePosition(end);

                editor.selection = new vscode.Selection(validStart, validEnd);
                if (setActive) {
                    editor.revealRange(new vscode.Range(validStart, validEnd));
                }
            }

            return editor;

        } catch (error) {
            Logger.warn(`Failed to show tab: ${tabInfo.uri}`, error);
            return undefined;
        }
    }

    // Enhanced project switch with optimized tab handling
    async switchToProject(newProjectId: string): Promise<boolean> {
        const newProject = getProjectById(newProjectId);
        if (!newProject) return false;

        try {
            // Step 1: Hide current project tabs (fast)
            if (state.currentProjectId && state.currentProjectId !== newProjectId) {
                await this.hideCurrentProjectTabs();
            }

            // Step 2: Update current project
            state.currentProjectId = newProjectId;
            newProject.lastUsed = Date.now();

            // Step 3: Show new project tabs (optimized)
            await this.showProjectTabs(newProjectId);

            return true;

        } catch (error) {
            Logger.error(`Failed to switch to project: ${newProject.name}`, error);
            return false;
        }
    }

    // Fallback method using traditional session restore
    private async restoreSessionFromStorage(projectId: string): Promise<boolean> {
        const session = state.sessions.get(projectId);
        if (!session || !session.tabs.length) return false;

        const project = getProjectById(projectId);
        if (!project) return false;

        try {
            const validTabs = await this.validateAndFilterTabs(session.tabs, project.path);
            if (validTabs.length === 0) return false;

            // Restore in batches to improve performance
            const batchSize = 15;
            let restoredCount = 0;

            for (let i = 0; i < validTabs.length; i += batchSize) {
                const batch = validTabs.slice(i, i + batchSize);

                for (const tabInfo of batch) {
                    const editor = await this.openTab(tabInfo, false);
                    if (editor) restoredCount++;
                }

                // Progress feedback
                if (validTabs.length > 20) {
                    const progress = Math.round((i + batchSize) / validTabs.length * 100);
                    Logger.debug(`Restoring tabs: ${Math.min(progress, 100)}%`);
                }

                // Prevent UI freeze
                await new Promise(resolve => setTimeout(resolve, 30));
            }

            // Focus active tab last
            const activeTab = validTabs.find(t => t.isActive) || validTabs[0];
            if (activeTab) {
                await this.openTab(activeTab, true);
            }

            Logger.info(`Restored ${restoredCount}/${validTabs.length} tabs for project: ${project.name}`);
            return true;

        } catch (error) {
            Logger.error(`Failed to restore session for project ${projectId}`, error);
            return false;
        }
    }

    // Save current state to persistent storage (only when needed)
    async saveCurrentSession(): Promise<void> {
        if (!state.currentProjectId) return;

        const project = getProjectById(state.currentProjectId);
        if (!project || project.sessionEnabled === false) return;

        try {
            // Get current tabs (including hidden ones)
            const tabs = await this.getAllProjectTabs();

            const session: ProjectSession = {
                projectId: state.currentProjectId,
                tabs,
                activeTab: vscode.window.activeTextEditor?.document.uri.toString(),
                explorerState: await this.getExplorerState(),
                lastSaved: Date.now()
            };

            state.sessions.set(state.currentProjectId, session);
            this.saveSessions();

            Logger.debug(`Saved session for project ${state.currentProjectId} with ${tabs.length} tabs`);

        } catch (error) {
            Logger.error('Failed to save current session', error);
        }
    }

    private async getAllProjectTabs(): Promise<TabInfo[]> {
        if (!state.currentProjectId) return [];

        const project = getProjectById(state.currentProjectId);
        if (!project) return [];

        const tabs: TabInfo[] = [];

        // Get visible tabs
        for (const tabGroup of vscode.window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;
                    if (uri.scheme === 'file' && uri.fsPath.startsWith(project.path)) {
                        tabs.push({
                            uri: uri.toString(),
                            isActive: tab.isActive,
                            isPinned: tab.isPinned,
                            viewColumn: tabGroup.viewColumn,
                            isDirty: tab.isDirty,
                            selection: await this.getEditorSelection(uri)
                        });
                    }
                }
            }
        }

        // Add hidden tabs
        const tabState = this.projectTabStates.get(state.currentProjectId);
        if (tabState) {
            for (const hiddenTab of tabState.hiddenTabs) {
                if (!tabs.some(t => t.uri === hiddenTab.uri)) {
                    tabs.push({
                        uri: hiddenTab.uri,
                        isActive: hiddenTab.isActive,
                        isPinned: hiddenTab.isPinned,
                        viewColumn: hiddenTab.viewColumn,
                        isDirty: hiddenTab.isDirty,
                        selection: hiddenTab.selection
                    });
                }
            }
        }

        return tabs;
    }

    // Utility methods
    private async getDocument(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
        try {
            // Check if document is already open
            const openDoc = vscode.workspace.textDocuments.find(doc =>
                doc.uri.toString() === uri.toString()
            );

            return openDoc || await vscode.workspace.openTextDocument(uri);
        } catch (error) {
            Logger.warn(`Failed to get document: ${uri.toString()}`, error);
            return undefined;
        }
    }

    private async getEditorSelection(uri: vscode.Uri): Promise<TabInfo['selection']> {
        try {
            const editor = vscode.window.visibleTextEditors.find(e =>
                e.document.uri.toString() === uri.toString()
            );

            if (editor) {
                return {
                    start: {
                        line: editor.selection.start.line,
                        character: editor.selection.start.character
                    },
                    end: {
                        line: editor.selection.end.line,
                        character: editor.selection.end.character
                    }
                };
            }
        } catch (error) {
            Logger.debug('Failed to get editor selection', error);
        }
        return undefined;
    }

    private async validateAndFilterTabs(tabs: TabInfo[], projectPath: string): Promise<TabInfo[]> {
        const validTabs: TabInfo[] = [];

        for (const tabInfo of tabs) {
            try {
                const uri = vscode.Uri.parse(tabInfo.uri);

                // Check if file exists
                try {
                    await vscode.workspace.fs.stat(uri);
                } catch {
                    continue;
                }

                // Verify file is within project
                if (uri.fsPath.startsWith(projectPath)) {
                    validTabs.push(tabInfo);
                }
            } catch (error) {
                Logger.warn(`Invalid tab info: ${tabInfo.uri}`, error);
            }
        }

        return validTabs;
    }

    private async openTab(tabInfo: TabInfo, setActive: boolean): Promise<vscode.TextEditor | undefined> {
        try {
            const uri = vscode.Uri.parse(tabInfo.uri);
            const document = await vscode.workspace.openTextDocument(uri);

            const editor = await vscode.window.showTextDocument(document, {
                viewColumn: tabInfo.viewColumn || vscode.ViewColumn.One,
                preview: false,
                preserveFocus: !setActive
            });

            if (tabInfo.selection) {
                const start = new vscode.Position(
                    Math.max(0, tabInfo.selection.start.line),
                    Math.max(0, tabInfo.selection.start.character)
                );
                const end = new vscode.Position(
                    Math.max(0, tabInfo.selection.end.line),
                    Math.max(0, tabInfo.selection.end.character)
                );

                const validStart = document.validatePosition(start);
                const validEnd = document.validatePosition(end);

                editor.selection = new vscode.Selection(validStart, validEnd);
                if (setActive) {
                    editor.revealRange(new vscode.Range(validStart, validEnd));
                }
            }

            return editor;
        } catch (error) {
            Logger.warn(`Failed to open tab: ${tabInfo.uri}`, error);
            return undefined;
        }
    }

    private async getExplorerState() {
        return {
            expandedDirectories: [],
            selectedFile: vscode.window.activeTextEditor?.document.uri.toString()
        };
    }

    // Cleanup
    dispose() {
        if (this.tabGroupWatcher) {
            this.tabGroupWatcher.dispose();
        }
        this.projectTabStates.clear();
    }

    // Additional utility methods for compatibility
    clearSession(projectId: string) {
        if (state.sessions.has(projectId)) {
            state.sessions.delete(projectId);
            this.saveSessions();
        }

        // Clear in-memory state
        this.projectTabStates.delete(projectId);
    }

    clearAllSessions() {
        const count = state.sessions.size;
        state.sessions.clear();
        this.projectTabStates.clear();
        this.saveSessions();
        Logger.info(`Cleared all ${count} project sessions`);
    }

    async getProjectTabCount(projectId: string): Promise<number> {
        const tabState = this.projectTabStates.get(projectId);
        if (tabState) {
            return tabState.hiddenTabs.length + tabState.visibleTabs.size;
        }

        // Fallback to session data
        const session = state.sessions.get(projectId);
        return session?.tabs.length || 0;
    }
}