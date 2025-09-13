// src/utils/statusBarUtils.ts - Centralized statusbar handling
import * as vscode from 'vscode';
import { state } from '../models/models';
import { getProjectById } from './projectUtils';
import { Logger } from './logger';

export function createStatusBarItem(context: vscode.ExtensionContext) {
    if (!state.statusBarItem) {
        state.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        state.statusBarItem.command = 'project-switcher.showProjectMenu';
        context.subscriptions.push(state.statusBarItem);
        Logger.debug('Status bar item created');
    }
}

export function updateStatusBar() {
    // Don't create statusbar if Project Switcher is not enabled
    if (!state.isProjectSwitcherEnabled) {
        if (state.statusBarItem) {
            state.statusBarItem.hide();
        }
        return;
    }

    if (!state.statusBarItem) {
        Logger.warn('Status bar item missing when it should exist');
        return;
    }

    if (state.currentProjectId) {
        const project = getProjectById(state.currentProjectId);
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

    // Show status when Project Switcher is enabled but no project selected
    if (state.isProjectSwitcherEnabled) {
        let statusText = `$(folder) No Project`;
        if (state.workspaceFilter?.isCurrentlyFiltering()) {
            statusText += ' $(filter)';
        }

        state.statusBarItem.text = statusText;
        state.statusBarItem.tooltip = 'No project selected. Click to manage projects.';
        state.statusBarItem.show();
    } else {
        // Hide status bar when disabled
        state.statusBarItem.hide();
    }
}