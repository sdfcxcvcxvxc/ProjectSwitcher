// src/utils/sessionManager.ts - Updated version
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
            const tabs = await this.getCurrentTabs();
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

    async restoreSession(projectId: string): Promise<boolean> {
        // Check if session management is enabled for this project
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

            // Close all current editors first
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');

            // Filter tabs that belong to the current project
            const projectTabs = await this.filterTabsForProject(session.tabs, project.path);

            if (projectTabs.length === 0) {
                Logger.debug(`No tabs found for project ${projectId} in current workspace`);
                return false;
            }

            // Restore tabs
            const restoredTabs: vscode.TextEditor[] = [];
            let activeEditor: vscode.TextEditor | undefined;

            for (const tabInfo of projectTabs) {
                try {
                    const uri = vscode.Uri.parse(tabInfo.uri);

                    // Check if file exists before trying to open
                    try {
                        await vscode.workspace.fs.stat(uri);
                    } catch {
                        Logger.warn(`File no longer exists, skipping: ${tabInfo.uri}`);
                        continue;
                    }

                    // Check if file is within project directory
                    const filePath = uri.fsPath;
                    if (!filePath.startsWith(project.path)) {
                        Logger.debug(`Skipping file outside project: ${tabInfo.uri}`);
                        continue;
                    }

                    const document = await vscode.workspace.openTextDocument(uri);

                    const editor = await vscode.window.showTextDocument(document, {
                        viewColumn: tabInfo.viewColumn || vscode.ViewColumn.One,
                        preview: false,
                        preserveFocus: !tabInfo.isActive
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

                        // Ensure positions are valid for the document
                        const validStart = document.validatePosition(start);
                        const validEnd = document.validatePosition(end);

                        editor.selection = new vscode.Selection(validStart, validEnd);
                        editor.revealRange(new vscode.Range(validStart, validEnd));
                    }

                    restoredTabs.push(editor);

                    if (tabInfo.isActive || tabInfo.uri === session.activeTab) {
                        activeEditor = editor;
                    }

                    Logger.debug(`Restored tab: ${tabInfo.uri}`);
                } catch (error) {
                    Logger.warn(`Failed to restore tab: ${tabInfo.uri}`, error);
                }
            }

            // Set active editor
            if (activeEditor) {
                await vscode.window.showTextDocument(activeEditor.document, {
                    viewColumn: activeEditor.viewColumn,
                    preserveFocus: false
                });
            }

            // Restore explorer state
            if (session.explorerState) {
                await this.restoreExplorerState(session.explorerState, project.path);
            }

            Logger.info(`Successfully restored session for project ${projectId}: ${restoredTabs.length}/${projectTabs.length} tabs`);
            return true;

        } catch (error) {
            Logger.error(`Failed to restore session for project ${projectId}`, error);
            return false;
        }
    }

    private async filterTabsForProject(tabs: TabInfo[], projectPath: string): Promise<TabInfo[]> {
        const filteredTabs: TabInfo[] = [];

        for (const tab of tabs) {
            try {
                const uri = vscode.Uri.parse(tab.uri);
                const filePath = uri.fsPath;

                // Only include tabs that are within the project directory
                if (filePath.startsWith(projectPath)) {
                    filteredTabs.push(tab);
                }
            } catch (error) {
                Logger.warn(`Failed to parse tab URI: ${tab.uri}`, error);
            }
        }

        return filteredTabs;
    }

    private async getCurrentTabs(): Promise<TabInfo[]> {
        const tabs: TabInfo[] = [];

        // Get all visible text editors
        const editors = vscode.window.visibleTextEditors;
        const activeEditor = vscode.window.activeTextEditor;

        for (const editor of editors) {
            const document = editor.document;

            // Skip untitled documents or those not in workspace
            if (document.isUntitled || document.uri.scheme !== 'file') {
                continue;
            }

            // Only include tabs that are within the current workspace
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspacePath && !document.uri.fsPath.startsWith(workspacePath)) {
                continue;
            }

            const tabInfo: TabInfo = {
                uri: document.uri.toString(),
                isActive: editor === activeEditor,
                isPinned: false, // VS Code API doesn't provide pinned state easily
                viewColumn: editor.viewColumn || vscode.ViewColumn.One,
                isDirty: document.isDirty,
                selection: {
                    start: {
                        line: editor.selection.start.line,
                        character: editor.selection.start.character
                    },
                    end: {
                        line: editor.selection.end.line,
                        character: editor.selection.end.character
                    }
                }
            };

            tabs.push(tabInfo);
        }

        return tabs;
    }

    private async getExplorerState() {
        // Basic explorer state capture
        // VS Code doesn't provide direct API for expanded folders, so we'll keep it simple
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

        const projectTabs = await this.filterTabsForProject(session.tabs, project.path);
        return projectTabs.length;
    }
}