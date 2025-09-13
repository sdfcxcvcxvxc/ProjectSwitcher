// src/models/models.ts - Added enabled field for project disable feature
import * as vscode from 'vscode';
import { WorkspaceFilter } from '../utils/workspaceFilter';

export interface ProjectConfig {
    id: string;
    name: string;
    path: string;
    order: number; // 1-9 for keyboard shortcuts
    color?: string;
    description?: string;
    lastUsed: number;
    sessionEnabled?: boolean;
    enabled?: boolean; // NEW: For requirement 4 - enable/disable projects
}

export interface TabInfo {
    uri: string;
    isActive: boolean;
    isPinned: boolean;
    viewColumn: vscode.ViewColumn;
    isDirty: boolean;
    selection?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface ProjectSession {
    projectId: string;
    tabs: TabInfo[];
    activeTab?: string;
    explorerState?: {
        expandedDirectories: string[];
        selectedFile?: string;
    };
    lastSaved: number;
}

export enum WorkspaceMode {
    None = 'none',
    SingleProject = 'single',
    ParentDirectory = 'parent'
}

export const state = {
    projects: [] as ProjectConfig[],
    sessions: new Map<string, ProjectSession>(),
    currentProjectId: undefined as string | undefined,
    workspaceMode: WorkspaceMode.None,
    isProjectSwitcherEnabled: false,
    isProjectFilteringEnabled: false,
    isInitialized: false,
    statusBarItem: undefined as vscode.StatusBarItem | undefined,
    sessionManager: undefined as any,
    workspaceFilter: undefined as WorkspaceFilter | undefined,
};

export interface ProjectTreeItem extends vscode.TreeItem {
    projectId: string;
    project: ProjectConfig;
}