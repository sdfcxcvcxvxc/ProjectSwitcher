import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;
    private static logLevel: LogLevel = LogLevel.DEBUG;

    static initialize() {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('Project Switcher');
        }
    }

    static debug(message: string, data?: any) {
        this.log(LogLevel.DEBUG, message, data);
    }

    static info(message: string, data?: any) {
        this.log(LogLevel.INFO, message, data);
    }

    static warn(message: string, data?: any) {
        this.log(LogLevel.WARN, message, data);
    }

    static error(message: string, error?: any) {
        this.log(LogLevel.ERROR, message, error);
    }

    private static log(level: LogLevel, message: string, data?: any) {
        if (!this.outputChannel || level < this.logLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level];
        let logMessage = `[${timestamp}] [${levelStr}] ${message}`;

        if (data !== undefined) {
            if (data instanceof Error) {
                logMessage += `\n  Error: ${data.message}\n  Stack: ${data.stack}`;
            } else if (typeof data === 'object') {
                try {
                    logMessage += `\n  Data: ${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    logMessage += `\n  Data: [Could not stringify object]`;
                }
            } else {
                logMessage += `\n  Data: ${data}`;
            }
        }

        this.outputChannel.appendLine(logMessage);
    }

    static show() {
        if (this.outputChannel) {
            this.outputChannel.show();
        }
    }

    static dispose() {
        if (this.outputChannel) {
            this.outputChannel.dispose();
            this.outputChannel = undefined;
        }
    }

    static setLogLevel(level: LogLevel) {
        this.logLevel = level;
    }
}