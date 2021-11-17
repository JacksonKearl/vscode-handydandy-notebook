/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { spawn, } from 'child_process';
import { dirname } from 'path';
import * as userHome from 'user-home';

export const omniExecutor: Executor = (
	cell: vscode.NotebookCell, logger: (s: string) => void, token: vscode.CancellationToken
): Promise<undefined> => {
	return new Promise((c, e) => {
		const language = cell.document.languageId;
		const commands = vscode.workspace.getConfiguration('handydandy-notebook').get('dispatch') as Record<string, [string, string[]]>;
		if (!commands[language]) {
			logger(`Your Handy Dandy Notebook cannot execute ${language || `_undefined lang_`} cells. Try adding an entry to \`handydandy-notebook.dispatch\` in settings.`);
			return c(undefined);
		}

		const command = [
			commands[language][0],
			commands[language][1].map(arg => arg.replace(/\$\{code\}/, `\n${cell.document.getText()}\n`))
		] as [string, string[]];

		const cwd = cell.document.uri.scheme === 'untitled'
			? vscode.workspace.workspaceFolders?.[0]?.uri.path ?? userHome
			: dirname(cell.document.uri.path);
		const process = spawn(...command, { cwd });

		process.on('error', (err) => {
			e(err);
		});

		process.stdout.on('data', (data: Buffer) => {
			logger(data.toString());
		});

		process.stderr.on('data', (data: Buffer) => {
			logger(data.toString());
		});

		process.on('close', () => {
			c(undefined);
		});

		token.onCancellationRequested(() => {
			process.kill();
		});
	});
};

type Eventually<T> = T | Promise<T>;
export type Executor = (
	cell: vscode.NotebookCell,
	log: (s: string) => void,
	token: vscode.CancellationToken,
) => Eventually<vscode.NotebookCellOutput | undefined>;

export const makeNotebookController = (controllerId: string, notebookId: string, label: string, executor: Executor): vscode.NotebookController => {
	const controller = vscode.notebooks.createNotebookController(controllerId, notebookId, label);

	controller.executeHandler = async (cells: vscode.NotebookCell[]) => {
		for (const cell of cells) {
			const execution = controller.createNotebookCellExecution(cell);

			execution.start(Date.now());
			execution.clearOutput();
			await executor(
				cell,
				s => execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(s)])),
				execution.token);
			execution.end(true, Date.now());
		}
	};

	return controller;
};