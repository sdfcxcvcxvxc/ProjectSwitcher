// src/models/models.ts - Removed status bar item and updated for dynamic ordering
import * as vscode from 'vscode';
import { WorkspaceFilter } from '../utils/workspaceFilter';

export interface ProjectConfig {
    id: string;
    name: string;
    path: string;
    order: number; // 1-9 for original order (used for sorting, but dynamic order used for shortcuts)
    color?: string;
    description?: string;
    lastUsed: number;
    sessionEnabled?: boolean;
    enabled?: boolean; // For requirement 4 - enable/disable projects
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
    // REMOVED: statusBarItem - no longer needed
    sessionManager: undefined as any,
    workspaceFilter: undefined as WorkspaceFilter | undefined,
};

export interface ProjectTreeItem extends vscode.TreeItem {
    projectId: string;
    project: ProjectConfig;
}