/* eslint-disable @typescript-eslint/no-use-before-define */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable, inject } from 'inversify';
import { IExtensionContext, IHttpClient } from '../../platform/common/types';
import { IKernel } from '../types';
import { RemoteIPyWidgetScriptManager } from './remoteIPyWidgetScriptManager';
import { IIPyWidgetScriptManager, IIPyWidgetScriptManagerFactory } from './types';

@injectable()
export class IPyWidgetScriptManagerFactory implements IIPyWidgetScriptManagerFactory {
    private readonly managers = new WeakMap<IKernel, IIPyWidgetScriptManager>();
    constructor(
        @inject(IHttpClient) private readonly httpClient: IHttpClient,
        @inject(IExtensionContext) private readonly context: IExtensionContext
    ) {}
    getOrCreate(kernel: IKernel): IIPyWidgetScriptManager {
        if (!this.managers.has(kernel)) {
            if (
                kernel.kernelConnectionMetadata.kind === 'connectToLiveRemoteKernel' ||
                kernel.kernelConnectionMetadata.kind === 'startUsingRemoteKernelSpec'
            ) {
                this.managers.set(kernel, new RemoteIPyWidgetScriptManager(kernel, this.httpClient, this.context));
            } else {
                throw new Error('Cannot enumerate Widget Scripts using local kernels on the Web');
            }
        }
        return this.managers.get(kernel)!;
    }
}
