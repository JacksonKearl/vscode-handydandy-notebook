/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { MarkdownProvider, providerOptions } from './MarkdownProvider';
import { HandyDandyKernel } from './OmniExecutor';

export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.commands.registerCommand('handydandy-notebook.newNotebook', () =>
			vscode.commands.executeCommand('workbench.action.files.newUntitledFile', { "viewType": "handydandy-notebook" })),
		vscode.notebook.registerNotebookContentProvider(
			'handydandy-notebook', new MarkdownProvider(), providerOptions),
		vscode.notebook.registerNotebookContentProvider(
			'handydandy-notebook-md', new MarkdownProvider(), providerOptions),
		vscode.notebook.registerNotebookKernelProvider(
			{ viewType: 'handydandy-notebook' }, { provideKernels: () => [HandyDandyKernel] }),
		vscode.notebook.registerNotebookKernelProvider(
			{ viewType: 'handydandy-notebook-md' }, { provideKernels: () => [HandyDandyKernel] })
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
