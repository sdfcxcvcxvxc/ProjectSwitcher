// src/utils/sessionManager.ts - Enhanced version with tab filtering
import * as vscode from 'vscode';
import * as path from 'path';
import { state, ProjectSession, TabInfo } from '../models/models';
import { getProjectById } from './projectUtils';
import { Logger } from './logger';

export class SessionManager {
    private context?: vscode.ExtensionContext;

    constructor(context?: vscode.ExtensionContext) {
        this.context = context;
        this.loadSessions();
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

    async saveCurrentSession() {
        if (!state.currentProjectId) {
            Logger.debug('No current project to save session for');
            return;
        }

        // Check if session management is enabled for this project
        const project = getProjectById(state.currentProjectId);
        if (!project || project.sessionEnabled === false) {
            Logger.debug(`Session management disabled for project ${state.currentProjectId}`);
            return;
        }

        try {
            // Only save tabs that belong to the current project
            const tabs = await this.getCurrentProjectTabs();
            const explorerState = await this.getExplorerState();

            const session: ProjectSession = {
                projectId: state.currentProjectId,
                tabs,
                activeTab: vscode.window.activeTextEditor?.document.uri.toString(),
                explorerState,
                lastSaved: Date.now()
            };

            state.sessions.set(state.currentProjectId, session);
            this.saveSessions();

            Logger.debug(`Saved session for project ${state.currentProjectId} with ${tabs.length} tabs`);
        } catch (error) {
            Logger.error('Failed to save current session', error);
        }
    }

    // Enhanced method to get only tabs belonging to current project
    private async getCurrentProjectTabs(): Promise<TabInfo[]> {
        const tabs: TabInfo[] = [];

        if (!state.currentProjectId) return tabs;

        const project = getProjectById(state.currentProjectId);
        if (!project) return tabs;

        // Get all tab groups instead of just visible editors
        const tabGroups = vscode.window.tabGroups.all;

        for (const tabGroup of tabGroups) {
            for (const tab of tabGroup.tabs) {
                // Handle different types of tab inputs
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;

                    // Skip untitled documents or those not in workspace
                    if (uri.scheme !== 'file') {
                        continue;
                    }

                    const filePath = uri.fsPath;

                    // Only include tabs that are within the current project directory
                    if (!filePath.startsWith(project.path)) {
                        continue;
                    }

                    const tabInfo: TabInfo = {
                        uri: uri.toString(),
                        isActive: tab.isActive,
                        isPinned: tab.isPinned,
                        viewColumn: tabGroup.viewColumn,
                        isDirty: tab.isDirty,
                        selection: await this.getEditorSelection(uri)
                    };

                    tabs.push(tabInfo);
                }
            }
        }

        Logger.debug(`Found ${tabs.length} tabs for project: ${project.name}`);
        return tabs;
    }

    private async getEditorSelection(uri: vscode.Uri): Promise<TabInfo['selection']> {
        try {
            // Find the editor for this URI
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

    async restoreSession(projectId: string): Promise<boolean> {
        const project = getProjectById(projectId);
        if (!project || project.sessionEnabled === false) {
            Logger.debug(`Session management disabled for project ${projectId}, skipping restore`);
            return false;
        }

        const session = state.sessions.get(projectId);
        if (!session || !session.tabs.length) {
            Logger.debug(`No session found for project ${projectId}`);
            return false;
        }

        try {
            Logger.debug(`Restoring session for project ${projectId} with ${session.tabs.length} tabs`);

            // Ensure all editors are closed first
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Filter and validate tabs
            const validTabs = await this.validateAndFilterTabs(session.tabs, project.path);

            if (validTabs.length === 0) {
                Logger.debug(`No valid tabs to restore for project ${projectId}`);
                return false;
            }

            // Restore tabs in correct order
            const restoredTabs: vscode.TextEditor[] = [];
            let activeEditor: vscode.TextEditor | undefined;

            // Open non-active tabs first
            for (const tabInfo of validTabs.filter(t => !t.isActive)) {
                const editor = await this.openTab(tabInfo);
                if (editor) {
                    restoredTabs.push(editor);
                }
            }

            // Open active tab last
            const activeTab = validTabs.find(t => t.isActive) || validTabs[0];
            if (activeTab) {
                const editor = await this.openTab(activeTab, true);
                if (editor) {
                    restoredTabs.push(editor);
                    activeEditor = editor;
                }
            }

            // Ensure active editor gets focus
            if (activeEditor) {
                await vscode.window.showTextDocument(activeEditor.document, {
                    viewColumn: activeEditor.viewColumn,
                    preserveFocus: false
                });
            }

            Logger.info(`Successfully restored session for project ${projectId}: ${restoredTabs.length}/${validTabs.length} tabs`);
            return true;

        } catch (error) {
            Logger.error(`Failed to restore session for project ${projectId}`, error);
            return false;
        }
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
                    Logger.debug(`File no longer exists, skipping: ${tabInfo.uri}`);
                    continue;
                }

                // Verify file is within project directory
                const filePath = uri.fsPath;
                if (!filePath.startsWith(projectPath)) {
                    Logger.debug(`Skipping file outside current project: ${tabInfo.uri}`);
                    continue;
                }

                validTabs.push(tabInfo);
            } catch (error) {
                Logger.warn(`Invalid tab info, skipping: ${tabInfo.uri}`, error);
            }
        }

        return validTabs;
    }

    private async openTab(tabInfo: TabInfo, setActive: boolean = false): Promise<vscode.TextEditor | undefined> {
        try {
            const uri = vscode.Uri.parse(tabInfo.uri);
            const document = await vscode.workspace.openTextDocument(uri);

            const editor = await vscode.window.showTextDocument(document, {
                viewColumn: tabInfo.viewColumn || vscode.ViewColumn.One,
                preview: false,
                preserveFocus: !setActive
            });

            // Restore cursor position and selection
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
                editor.revealRange(new vscode.Range(validStart, validEnd));
            }

            Logger.debug(`Opened tab: ${tabInfo.uri}`);
            return editor;

        } catch (error) {
            Logger.warn(`Failed to open tab: ${tabInfo.uri}`, error);
            return undefined;
        }
    }

    private async getExplorerState() {
        // Basic explorer state capture
        return {
            expandedDirectories: [], // Could be enhanced with more complex logic
            selectedFile: vscode.window.activeTextEditor?.document.uri.toString()
        };
    }

    private async restoreExplorerState(explorerState: any, projectPath: string) {
        try {
            // Focus the project directory in explorer
            const projectUri = vscode.Uri.file(projectPath);
            await vscode.commands.executeCommand('revealInExplorer', projectUri);

            // If there was a selected file, try to reveal it
            if (explorerState.selectedFile) {
                try {
                    const fileUri = vscode.Uri.parse(explorerState.selectedFile);
                    // Only reveal if it's within the project
                    if (fileUri.fsPath.startsWith(projectPath)) {
                        await vscode.commands.executeCommand('revealInExplorer', fileUri);
                    }
                } catch (error) {
                    Logger.warn('Failed to restore selected file in explorer', error);
                }
            }

            Logger.debug(`Restored explorer state for project: ${projectPath}`);
        } catch (error) {
            Logger.warn('Failed to restore explorer state', error);
        }
    }

    clearSession(projectId: string) {
        if (state.sessions.has(projectId)) {
            state.sessions.delete(projectId);
            this.saveSessions();
            Logger.info(`Cleared session for project ${projectId}`);
        }
    }

    clearAllSessions() {
        const count = state.sessions.size;
        state.sessions.clear();
        this.saveSessions();
        Logger.info(`Cleared all ${count} project sessions`);
    }

    // Method to save session for a specific project (used by manual save)
    async saveSessionForProject(projectId: string): Promise<boolean> {
        const project = getProjectById(projectId);
        if (!project) {
            Logger.warn(`Project not found: ${projectId}`);
            return false;
        }

        if (project.sessionEnabled === false) {
            Logger.debug(`Session management disabled for project ${projectId}`);
            return false;
        }

        try {
            // Temporarily set as current project for session saving
            const originalCurrentProject = state.currentProjectId;
            state.currentProjectId = projectId;

            await this.saveCurrentSession();

            // Restore original current project
            state.currentProjectId = originalCurrentProject;

            Logger.info(`Manually saved session for project ${projectId}`);
            return true;
        } catch (error) {
            Logger.error(`Failed to manually save session for project ${projectId}`, error);
            return false;
        }
    }

    // Get session info for display purposes
    getSessionInfo(projectId: string): { hasSession: boolean; tabCount: number; lastSaved?: Date } {
        const session = state.sessions.get(projectId);
        return {
            hasSession: !!session,
            tabCount: session?.tabs.length || 0,
            lastSaved: session ? new Date(session.lastSaved) : undefined
        };
    }

    // Enhanced method to get project-specific tab count
    async getProjectTabCount(projectId: string): Promise<number> {
        const project = getProjectById(projectId);
        if (!project) return 0;

        const session = state.sessions.get(projectId);
        if (!session) return 0;

        // Filter tabs to only those within the project
        const projectTabs = session.tabs.filter(tab => {
            try {
                const uri = vscode.Uri.parse(tab.uri);
                return uri.fsPath.startsWith(project.path);
            } catch {
                return false;
            }
        });

        return projectTabs.length;
    }
}