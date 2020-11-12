/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const providerOptions = {
  transientMetadata: {
    runnable: true,
    editable: true,
    custom: true,
  },
  transientOutputs: true
};

const getMostCommonFileType = async () => {
  const types = [
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['py', 'python'],
    ['rb', 'ruby'],
    ['sh', 'bash'],
  ];
  const max = { name: 'bash', number: 0 };
  await Promise.all(types.map(async ([ext, name]) => {
    const results = await vscode.workspace.findFiles('src/*.' + ext, undefined, 100);
    if (results.length > max.number) { max.number = results.length; max.name = name; }
  }));
  return max.name;
};

export class MarkdownProvider implements vscode.NotebookContentProvider {
  options?: vscode.NotebookDocumentContentOptions = providerOptions;

  onDidChangeNotebookContentOptions?: vscode.Event<vscode.NotebookDocumentContentOptions> | undefined;

  async resolveNotebook(document: vscode.NotebookDocument, webview: vscode.NotebookCommunication): Promise<void> { }

  async backupNotebook(document: vscode.NotebookDocument, context: vscode.NotebookDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.NotebookDocumentBackup> {
    await this.saveNotebookAs(context.destination, document, cancellation);
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination)
    };
  }

  private lastSelection: { code: string, lang: string } | undefined;
  setLastSelection(selection: { code: string, lang: string }) {
    this.lastSelection = selection;
  }

  async openNotebook(uri: vscode.Uri, openContext: vscode.NotebookDocumentOpenContext): Promise<vscode.NotebookData> {
    const lastSelection = this.lastSelection;
    this.lastSelection = undefined;

    if (openContext.backupId) {
      uri = vscode.Uri.parse(openContext.backupId);
    }
    const languages = Object.keys(vscode.workspace.getConfiguration('handydandy-notebook').get('dispatch') as Record<string, [string, string[]]>);
    const metadata: vscode.NotebookDocumentMetadata = { editable: true, cellEditable: true, cellHasExecutionOrder: false, cellRunnable: true, runnable: true };

    const content = uri.scheme === 'untitled'
      ? lastSelection ? `\`\`\`${lastSelection.lang}\n${lastSelection.code}\n\`\`\`` : ''
      : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

    let cellRawData: RawNotebookCell[];
    if (content.trim().length === 0) {
      const type = await getMostCommonFileType();
      cellRawData = parseMarkdown('```' + type + '\n```');
    } else {
      cellRawData = parseMarkdown(content.trim().length ? content : '```' + '' + '\n```');
    }
    const cells = cellRawData.map(rawToNotebookCellData);

    return {
      languages,
      metadata,
      cells
    };
  }

  async saveNotebook(document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> {
    const stringOutput = writeCellsToMarkdown(document.cells);
    await vscode.workspace.fs.writeFile(document.uri, Buffer.from(stringOutput));
  }

  async saveNotebookAs(targetResource: vscode.Uri, document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> {
    const stringOutput = writeCellsToMarkdown(document.cells);
    await vscode.workspace.fs.writeFile(targetResource, Buffer.from(stringOutput));
  }

  private _onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>();
  readonly onDidChangeNotebook = this._onDidChangeNotebook.event;
}

export function rawToNotebookCellData(data: RawNotebookCell): vscode.NotebookCellData {
  return <vscode.NotebookCellData>{
    cellKind: data.kind,
    language: data.language,
    metadata: { editable: true, runnable: true, custom: { leadingWhitespace: data.leadingWhitespace, trailingWhitespace: data.trailingWhitespace, indentation: data.indentation } },
    outputs: [],
    source: data.content
  };
}


export interface RawNotebookCell {
  indentation?: string;
  leadingWhitespace: string;
  trailingWhitespace: string;
  language: string;
  content: string;
  kind: vscode.CellKind;
}

const LANG_IDS = new Map([
  ['bat', 'batch'],
  ['c++', 'cpp'],
  ['js', 'javascript'],
  ['ts', 'typescript'],
  ['cs', 'csharp'],
  ['py', 'python'],
  ['py2', 'python'],
  ['py3', 'python'],
]);
const LANG_ABBREVS = new Map(
  Array.from(LANG_IDS.keys()).map(k => [LANG_IDS.get(k), k])
);

interface ICodeBlockStart {
  langId: string;
  indentation: string
}

/**
 * Note - the indented code block parsing is basic. It should only be applied inside lists, indentation should be consistent across lines and
 * between the start and end blocks, etc. This is good enough for typical use cases.
 */
function parseCodeBlockStart(line: string): ICodeBlockStart | null {
  const match = line?.match(/(    |\t)?```(\S*)/);
  return match && {
    indentation: match[1],
    langId: match[2]
  };
}

function isCodeBlockStart(line: string): boolean {
  return !!parseCodeBlockStart(line);
}

function isCodeBlockEndLine(line: string): boolean {
  return !!line.match(/^\s*```/);
}

export function parseMarkdown(content: string): RawNotebookCell[] {
  const lines = content.split(/\r?\n/g);
  let cells: RawNotebookCell[] = [];
  let i = 0;

  // Each parse function starts with line i, leaves i on the line after the last line parsed
  for (; i < lines.length;) {
    const leadingWhitespace = i === 0 ? parseWhitespaceLines(true) : '';
    const codeBlockMatch = parseCodeBlockStart(lines[i]);
    if (codeBlockMatch) {
      parseCodeBlock(leadingWhitespace, codeBlockMatch);
    } else {
      parseMarkdownParagraph(leadingWhitespace);
    }
  }

  function parseWhitespaceLines(isFirst: boolean): string {
    let start = i;
    const nextNonWhitespaceLineOffset = lines.slice(start).findIndex(l => l !== '');
    let end: number; // will be next line or overflow
    let isLast = false;
    if (nextNonWhitespaceLineOffset < 0) {
      end = lines.length;
      isLast = true;
    } else {
      end = start + nextNonWhitespaceLineOffset;
    }

    i = end;
    const numWhitespaceLines = end - start + (isFirst || isLast ? 0 : 1);
    return '\n'.repeat(numWhitespaceLines);
  }

  function parseCodeBlock(leadingWhitespace: string, codeBlockStart: ICodeBlockStart): void {
    const language = LANG_IDS.get(codeBlockStart.langId) || codeBlockStart.langId;
    const startSourceIdx = ++i;
    while (true) {
      const currLine = lines[i];
      if (i >= lines.length) {
        break;
      } else if (isCodeBlockEndLine(currLine)) {
        i++; // consume block end marker
        break;
      }

      i++;
    }

    const content = lines.slice(startSourceIdx, i - 1)
      .map(line => line.replace(new RegExp('^' + codeBlockStart.indentation), ''))
      .join('\n');
    const trailingWhitespace = parseWhitespaceLines(false);
    cells.push({
      language,
      content,
      kind: vscode.CellKind.Code,
      leadingWhitespace: leadingWhitespace,
      trailingWhitespace: trailingWhitespace,
      indentation: codeBlockStart.indentation
    });
  }

  function parseMarkdownParagraph(leadingWhitespace: string): void {
    const startSourceIdx = i;
    while (true) {
      if (i >= lines.length) {
        break;
      }

      const currLine = lines[i];
      if (currLine === '' || isCodeBlockStart(currLine)) {
        break;
      }

      i++;
    }

    const content = lines.slice(startSourceIdx, i).join('\n');
    const trailingWhitespace = parseWhitespaceLines(false);
    cells.push({
      language: 'markdown',
      content,
      kind: vscode.CellKind.Markdown,
      leadingWhitespace: leadingWhitespace,
      trailingWhitespace: trailingWhitespace
    });
  }

  return cells;
}

export function writeCellsToMarkdown(cells: ReadonlyArray<vscode.NotebookCell>): string {
  let result = '';
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (i === 0) {
      result += cell.metadata.custom?.leadingWhitespace ?? '';
    }

    if (cell.cellKind === vscode.CellKind.Code) {
      const indentation = cell.metadata.custom?.indentation || '';
      const languageAbbrev = LANG_ABBREVS.get(cell.language) || cell.language;
      const codePrefix = indentation + '```' + languageAbbrev + '\n';
      const contents = cell.document.getText().split(/\r?\n/g)
        .map(line => indentation + line)
        .join('\n');
      const codeSuffix = '\n' + indentation + '```';

      result += codePrefix + contents + codeSuffix;
    } else {
      result += cell.document.getText();
    }

    result += getBetweenCellsWhitespace(cells, i);
  }
  return result;
}

function getBetweenCellsWhitespace(cells: ReadonlyArray<vscode.NotebookCell>, idx: number): string {
  const thisCell = cells[idx];
  const nextCell = cells[idx + 1];

  if (!nextCell) {
    return thisCell.metadata.custom?.trailingWhitespace ?? '\n';
  }

  const trailing = thisCell.metadata.custom?.trailingWhitespace;
  const leading = nextCell.metadata.custom?.leadingWhitespace;

  if (typeof trailing === 'string' && typeof leading === 'string') {
    return trailing + leading;
  }

  // One of the cells is new
  const combined = (trailing ?? '') + (leading ?? '');
  if (!combined || combined === '\n') {
    return '\n\n';
  }

  return combined;
}