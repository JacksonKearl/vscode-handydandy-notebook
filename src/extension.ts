/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { MarkdownProvider, providerOptions } from './MarkdownProvider';
import { makeNotebookController, omniExecutor } from './OmniExecutor';

export function activate(context: vscode.ExtensionContext) {
	const provider = new MarkdownProvider();

	context.subscriptions.push(
		vscode.commands.registerCommand('handydandy-notebook.newNotebook', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				for (const selection of activeEditor.selections ?? []) {
					const selectedCode = activeEditor.document.getText(new vscode.Range(selection.start, selection.end));
					const selectedLang = activeEditor.document.languageId;
					provider.setLastSelection({ code: selectedCode, lang: selectedLang });
				}
			}
			await vscode.commands.executeCommand('workbench.action.files.newUntitledFile', { "viewType": "handydandy-notebook" });
		}),

		vscode.workspace.registerNotebookSerializer('handydandy-notebook', provider, providerOptions),
		vscode.workspace.registerNotebookSerializer('handydandy-notebook-md', provider, providerOptions),

		makeNotebookController('handy-dandy-kernel', 'handydandy-notebook', 'Handy Dandy Kernel', omniExecutor(context)),
		makeNotebookController('handy-dandy-kernel-md', 'handydandy-notebook-md', 'Handy Dandy Kernel (Markdown)', omniExecutor(context)),
	);
}

// this method is called when your extension is deactivated
export function deactivate() { }
