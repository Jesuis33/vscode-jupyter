// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable, named } from 'inversify';
import { Memento } from 'vscode';
import { IExtensionSyncActivationService } from '../../platform/activation/types';
import { Telemetry } from '../../platform/common/constants';
import { IProcessServiceFactory } from '../../platform/common/process/types.node';
import { GLOBAL_MEMENTO, IMemento } from '../../platform/common/types';
import { swallowExceptions } from '../../platform/common/utils/decorators';
import { noop } from '../../platform/common/utils/misc';
import { ITerminalHelper, TerminalShellType } from '../../platform/terminals/types';
import * as path from '../../platform/vscode-path/path';
import { sendTelemetryEvent } from '../../telemetry';

const JupyterDetectionTelemetrySentMementoKey = 'JupyterDetectionTelemetrySentMementoKey';

@injectable()
export class JupyterDetectionTelemetry implements IExtensionSyncActivationService {
    constructor(
        @inject(ITerminalHelper) private readonly terminalHelper: ITerminalHelper,
        @inject(IMemento) @named(GLOBAL_MEMENTO) private readonly globalMemento: Memento,
        @inject(IProcessServiceFactory) private readonly processFactory: IProcessServiceFactory
    ) {}
    public activate(): void {
        this.initialize().catch(noop);
    }
    @swallowExceptions()
    private async initialize(): Promise<void> {
        // If we've sent this telemetry once before then no need to check again.
        // E.g. if the user were to use our extension, then they might subsequently
        // install jupyter and configure things as part of using VS Code.
        // This telemetry is useful for first time users, users without support for raw kernels, etc.
        if (this.globalMemento.get<boolean>(JupyterDetectionTelemetrySentMementoKey, false)) {
            return;
        }
        this.globalMemento.update(JupyterDetectionTelemetrySentMementoKey, true).then(noop, noop);
        this.detectJupyter('notebook', process.env).catch(noop);
        this.detectJupyter('lab', process.env).catch(noop);
        const { env, shell } = await this.terminalHelper.getEnvironmentVariables(undefined);
        if (!env) {
            return;
        }
        const mergedVariables = { ...process.env };
        Object.keys(env).forEach((key) => {
            if (key in process.env) {
                return;
            }
            if (key.toLowerCase() == 'path') {
                // Append path from terminal.
                let delimiter = path.delimiter;
                const currentPath = (process.env['PATH'] || process.env['Path'] || '').trim();
                const terminalPath = (env['PATH'] || env['Path'] || '').trim();
                if (currentPath.endsWith(delimiter)) {
                    delimiter = '';
                }
                if (terminalPath.startsWith(delimiter)) {
                    delimiter = '';
                }
                mergedVariables[key] = `${currentPath}${delimiter}${terminalPath}`;
            } else {
                mergedVariables[key] = env[key];
            }
        });
        this.detectJupyter('notebook', mergedVariables, shell).catch(noop);
        this.detectJupyter('lab', mergedVariables, shell).catch(noop);
    }
    private async detectJupyter(
        frontEnd: 'notebook' | 'lab',
        env: NodeJS.ProcessEnv,
        shell?: TerminalShellType
    ): Promise<void> {
        try {
            const processService = await this.processFactory.create(undefined);
            const output = await processService.exec('jupyter', [frontEnd, '--version'], {
                env,
                throwOnStdErr: false,
                mergeStdOutErr: true
            });
            const versionLines = output.stdout
                .splitLines({ trim: true, removeEmptyEntries: true })
                .filter((line) => !isNaN(parseInt(line.substring(0, 1), 10)));
            const versionMatch = /^\s*(\d+)\.(\d+)\.(.+)\s*$/.exec(versionLines.length ? versionLines[0] : '');
            if (versionMatch && versionMatch.length > 2) {
                const major = parseInt(versionMatch[1], 10);
                const minor = parseInt(versionMatch[2], 10);
                const frontEndVersion = parseFloat(`${major}.${minor}`);
                if (shell) {
                    sendTelemetryEvent(Telemetry.JupyterInstalled, undefined, {
                        frontEnd,
                        frontEndVersion,
                        detection: 'shell',
                        shellType: shell
                    });
                } else {
                    sendTelemetryEvent(Telemetry.JupyterInstalled, undefined, {
                        frontEnd,
                        frontEndVersion,
                        detection: 'process'
                    });
                }
            } else {
                sendTelemetryEvent(Telemetry.JupyterInstalled, undefined, {
                    failed: true,
                    reason: 'notInstalled',
                    frontEnd
                });
            }
        } catch (ex) {
            sendTelemetryEvent(Telemetry.JupyterInstalled, undefined, {
                failed: true,
                reason: 'notInstalled',
                frontEnd
            });
        }
    }
}
