/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { MarkdownProvider, providerOptions } from './MarkdownProvider';
import { HandyDandyKernel } from './OmniExecutor';

export function activate(context: vscode.ExtensionContext) {
	const provider = new MarkdownProvider();
	context.subscriptions.push(
		vscode.commands.registerCommand('handydandy-notebook.newNotebook', async () => {
			const selection = vscode.window.activeTextEditor?.selection;
			if (selection) {
				const selectedCode = vscode.window.activeTextEditor!.document.getText(new vscode.Range(selection.start, selection.end));
				const selectedLang = vscode.window.activeTextEditor!.document.languageId;
				provider.setLastSelection({ code: selectedCode, lang: selectedLang });
			}

			await vscode.commands.executeCommand('workbench.action.files.newUntitledFile', { "viewType": "handydandy-notebook" });
		}),
		vscode.notebook.registerNotebookContentProvider(
			'handydandy-notebook', provider, providerOptions),
		vscode.notebook.registerNotebookContentProvider(
			'handydandy-notebook-md', provider, providerOptions),
		vscode.notebook.registerNotebookKernelProvider(
			{ viewType: 'handydandy-notebook' }, { provideKernels: () => [HandyDandyKernel] }),
		vscode.notebook.registerNotebookKernelProvider(
			{ viewType: 'handydandy-notebook-md' }, { provideKernels: () => [HandyDandyKernel] })
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
