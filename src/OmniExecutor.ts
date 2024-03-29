/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { spawn, } from 'child_process';
import { dirname } from 'path';
import * as userHome from 'user-home';
import { createHash } from 'crypto';
import { env as pEnv } from 'process';

const codeCellExpander = (cell: vscode.NotebookCell, logger: (msg: string) => void, seen: Array<vscode.NotebookCell>): string => {
	let text = cell.document.getText() + '\n';

	if (text.includes(`{{cell:`)) {
		const allCells = cell.notebook.getCells();
		const codeFinder = (title: string) => {
			let allCode = '';

			const titles = allCells
				.map((c, i) => ({ c, i }))
				.filter(({ c }) =>
					c.kind === vscode.NotebookCellKind.Markup &&
					c.document.getText().toLowerCase().includes(`# ${title}`.toLowerCase()))
				.map(({ i }) => i);

			for (const title of titles) {
				const code = allCells.find((c, i) => i > title && c.kind === vscode.NotebookCellKind.Code);
				if (!code) {
					logger('error: code cell with title ' + title + ' not found');
					continue;
				}
				if (seen.includes(cell)) {
					logger('error: recursive expansion, skipping');
					continue;
				}
				allCode += codeCellExpander(code, logger, [...seen, cell]);
			}
			return allCode;
		};
		text = text.replace(/{{cell:([^}]*)}}/g, (_, title) => codeFinder(title));
	}

	return text;
};

export const omniExecutor: (context: vscode.ExtensionContext) => Executor = (context) => (
	cell: vscode.NotebookCell, logger: (s: string) => void, token: vscode.CancellationToken
): Promise<undefined> => {
	return new Promise(async (c, e) => {
		let dispose = () => { };

		try {
			const language = cell.document.languageId;
			const commands = vscode.workspace.getConfiguration('handydandy-notebook').get('dispatch') as Record<string, [string, string[], Record<string, string>]>;
			if (!commands[language] || !commands[language][0] || !commands[language][1]) {
				logger(`Your Handy Dandy Notebook cannot execute ${language || `_undefined lang_`} cells. Try adding an entry to \`handydandy-notebook.dispatch\` in settings, this should be a map from language identifiers (${language || `_undefined lang_`})`);
				return c(undefined);
			}

			let text = codeCellExpander(cell, logger, []);
			if (text.includes('{{auth:github}}')) {
				const token = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
				if (!token) {
					logger('error: no auth available');
					return '';
				}
				text = text.replace(/{{auth:github}}/g, token.accessToken);
			}

			let cellFile: string | undefined;
			if (commands[language][1].some(arg => arg.includes('${code-path}'))) {
				const cellDir = vscode.Uri.joinPath(context.globalStorageUri, 'cells');
				const name = createHash('md5').update(text).digest('hex');
				const cellUri = vscode.Uri.joinPath(cellDir, name);
				dispose = () => vscode.workspace.fs.delete(cellUri, { useTrash: false });
				await vscode.workspace.fs.createDirectory(cellDir);
				await vscode.workspace.fs.writeFile(cellUri, Buffer.from(text));
				cellFile = cellUri.fsPath;
			}

			const command = [
				commands[language][0],
				commands[language][1]
					.map(arg => arg.replace(/\$\{code\}/, `\n${text}\n`))
					.map(arg => arg.replace(/\$\{code-path\}/, `${cellFile}`)),
			] as [string, string[]];

			const env = commands[language][2] ?? {};
			const isUntitled = cell.document.uri.path.startsWith('Untitled'); // Hard to detect naturally
			const cwd = isUntitled
				? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? userHome
				: dirname(cell.document.uri.fsPath);
			const process = spawn(...command, { cwd, env: { ...pEnv, ...env } });

			process.on('error', (err) => {
				dispose();
				e(err);
			});

			process.stdout.on('data', (data: Buffer) => {
				logger(data.toString());
			});

			process.stderr.on('data', (data: Buffer) => {
				logger(data.toString());
			});

			process.on('close', () => {
				dispose();
				c(undefined);
			});

			token.onCancellationRequested(() => {
				dispose();
				process.kill();
			});
		} catch (e) {
			console.error(e);
			dispose();
			throw (e);
		}
	});
};

type Eventually<T> = T | Promise<T>;
export type Executor = (
	cell: vscode.NotebookCell,
	log: (s: string) => void,
	token: vscode.CancellationToken,
) => Eventually<vscode.NotebookCellOutput | undefined>;

export const makeNotebookController = (controllerId: string, notebookId: string, label: string, executor: Executor): vscode.Disposable => {
	const controller = vscode.notebooks.createNotebookController(controllerId, notebookId, label);
	controller.supportedLanguages = Object.keys(vscode.workspace.getConfiguration('handydandy-notebook').get('dispatch') ?? {});

	const languageSupporter = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('handydandy-notebook.dispatch')) {
			controller.supportedLanguages = Object.keys(vscode.workspace.getConfiguration('handydandy-notebook').get('dispatch') ?? {});
		}
	});

	controller.executeHandler = async (cells: vscode.NotebookCell[]) => {
		for (const cell of cells) {
			const execution = controller.createNotebookCellExecution(cell);
			execution.start(Date.now());
			execution.clearOutput();
			try {
				await executor(
					cell,
					s => execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(s)])),
					execution.token);
				execution.end(true, Date.now());
			} catch (e) {
				execution.appendOutput(new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.error(e as any)]));
				execution.end(false, Date.now());
			}
		}
	};

	return {
		dispose() {
			controller.dispose();
			languageSupporter.dispose();
		}
	};
};