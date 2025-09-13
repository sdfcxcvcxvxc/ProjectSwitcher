import * as vscode from 'vscode';
import { ProjectTreeDataProvider } from '../providers/projectTreeDataProvider';
import { SessionManager } from '../utils/sessionManager';
import { registerProjectCommands } from './projectCommands';

export function registerAllCommands(
    context: vscode.ExtensionContext,
    treeDataProvider: ProjectTreeDataProvider,
    sessionManager: SessionManager
) {
    registerProjectCommands(context, treeDataProvider, sessionManager);
}