/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { spawn, } from 'child_process';
import { dirname } from 'path';

export function activate(context: vscode.ExtensionContext) {

	const omniExecutor: Executor = (
		code, cell, document, logger, token
	) => {
		return new Promise((c, e) => {
			console.log(cell);
			let command: [string, string[]];
			switch (cell.language) {
				case 'javascript':
					command = ['node', ['-e', `(async () => { ${code} } )()`]];
					break;
				case 'typescript':
					command = ['ts-node', ['-T', '-e', code]];
					break;
				case 'python':
					command = ['python', ['-c', code]];
					break;
				case 'shellscript': case 'bash':
					command = ['bash', ['-c', code]];
					break;
				default:
					logger(`Simple omnikernel cannot execute ${cell.language || `_undefined lang_`} cells`);
					return c();
			}
			const process = spawn(...command, { cwd: dirname(document.uri.path) });

			process.on('error', (err) => {
				logger('Failed to start subprocess.' + JSON.stringify(err));
				console.error('Failed to start subprocess.', err);
				e();
			});

			process.stdout.on('data', (data: Buffer) => {
				const str = data.toString();
				console.log(str);
				logger(str);
			});

			process.stderr.on('data', (data: Buffer) => {
				const str = data.toString();
				logger(str);
				console.error(data);
			});

			process.on('close', () => {
				c();
			});

			token.onCancellationRequested = () => {
				process.kill();
			};
		});
	};

	context.subscriptions.push(vscode.notebook.registerNotebookKernelProvider({ filenamePattern: '*' }, {
		provideKernels(document: vscode.NotebookDocument) {
			return [new SimpleKernel('Simple Omnikernel', omniExecutor),];
		}
	}));
}

// this method is called when your extension is deactivated
export function deactivate() { }

type Eventually<T> = T | Promise<T>;
type CancellationToken = { onCancellationRequested?: () => void };
export type Executor = (
	code: string,
	cell: vscode.NotebookCell,
	document: vscode.NotebookDocument,
	log: (s: string) => void,
	token: CancellationToken,
) => Eventually<vscode.CellOutput | undefined>;

export type NotebookTranslator = {
	serialize: (document: vscode.NotebookDocument) => Eventually<string>
	deserialize: (data: string) => Eventually<vscode.NotebookData>
};

export class SimpleKernel implements vscode.NotebookKernel {
	preloads?: vscode.Uri[] | undefined;

	private runIndex = 0;

	private cancellations = new Map<vscode.NotebookCell, CancellationToken>();

	constructor(public label: string, private executor: Executor) { }

	id?: string | undefined;
	description?: string | undefined;
	detail?: string | undefined;
	isPreferred?: boolean | undefined;

	cancelCellExecution(document: vscode.NotebookDocument, cell: vscode.NotebookCell): void {
		this.cancellations.get(cell)?.onCancellationRequested?.();
	}

	cancelAllCellsExecution(document: vscode.NotebookDocument): void {
		document.cells.forEach(cell => {
			this.cancellations.get(cell)?.onCancellationRequested?.();
		});
	}

	async executeCell(
		document: vscode.NotebookDocument,
		cell: vscode.NotebookCell,
	): Promise<void> {
		try {
			cell.metadata.runState = vscode.NotebookCellRunState.Running;
			const start = +new Date();
			cell.metadata.runStartTime = start;
			cell.metadata.executionOrder = ++this.runIndex;
			cell.outputs = [];
			const logger = (s: string) => {
				cell.outputs = [...cell.outputs, { outputKind: vscode.CellOutputKind.Text, text: s }];
			};
			const token: CancellationToken = { onCancellationRequested: undefined };
			this.cancellations.set(cell, token);
			await this.executor(cell.document.getText(), cell, document, logger, token);
			cell.metadata.runState = vscode.NotebookCellRunState.Success;
			cell.metadata.lastRunDuration = +new Date() - start;
		} catch (e) {
			cell.outputs = [...cell.outputs,
			{
				outputKind: vscode.CellOutputKind.Error,
				ename: e.name,
				evalue: e.message,
				traceback: [e.stack],
			},
			];
			cell.metadata.runState = vscode.NotebookCellRunState.Error;
			cell.metadata.lastRunDuration = undefined;
		} finally {
			this.cancellations.delete(cell);
		}
	}

	async executeAllCells(document: vscode.NotebookDocument): Promise<void> {
		for (const cell of document.cells) {
			await this.executeCell(document, cell);
		}
	}
}
