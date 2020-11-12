/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { spawn, } from 'child_process';
import { dirname } from 'path';
import * as userHome from 'user-home'

export const omniExecutor: Executor = (
  code: string, cell: vscode.NotebookCell, document: vscode.NotebookDocument, logger: (s: string) => void, token: CancellationToken
): Promise<vscode.CellStreamOutput | vscode.CellErrorOutput | vscode.CellDisplayOutput | undefined> => {
  return new Promise((c, e) => {

    const commands = vscode.workspace.getConfiguration('handydandy-notebook').get('dispatch') as Record<string, [string, string[]]>;
    if (!commands[cell.language]) {
      logger(`Your Handy Dandy Notebook cannot execute ${cell.language || `_undefined lang_`} cells. Try adding an entry to \`handydandy-notebook.dispatch\` in settings.`);
      return c(undefined);
    }

    const command = [
      commands[cell.language][0],
      commands[cell.language][1].map(arg => arg.replace(/\$\{code\}/, code))
    ] as [string, string[]]

    const cwd = document.uri.scheme === 'untitled'
      ? vscode.workspace.workspaceFolders?.[0]?.uri.path ?? userHome
      : dirname(document.uri.path);
    const process = spawn(...command, { cwd })

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

    token.onCancellationRequested = () => {
      process.kill();
    };
  });
};

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


export const HandyDandyKernel = new SimpleKernel('Handy Dandy Kernel', omniExecutor);