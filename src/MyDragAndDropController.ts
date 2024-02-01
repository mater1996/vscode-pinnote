
import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';
import { ExplorerItem } from './ExplorerDataProvider';

export class MyDragAndDropController
  implements vscode.TreeDragAndDropController<ExplorerItem>
{
  constructor(
    public readonly dragMimeTypes: string[],
    public readonly dropMimeTypes: string[]
  ) {}

  public async handleDrag(
    source: ExplorerItem[],
    treeDataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    treeDataTransfer.set(
      'application/vnd.code.tree.pinnoteView',
      new vscode.DataTransferItem(source)
    );
  }

  public async handleDrop(
    target: ExplorerItem | undefined,
    sources: vscode.DataTransfer
  ): Promise<void> {
    const transferItemAppContent = sources.get(
      'application/vnd.code.tree.pinnoteView'
    );
    if (
      target &&
      fs.statSync(target.path).isDirectory() &&
      transferItemAppContent
    ) {
      transferItemAppContent.value?.forEach((v: ExplorerItem) => {
        const targetFilePath = path.join(target.path, v.label);
        fs.moveSync(v.path, targetFilePath);
        vscode.commands.executeCommand('pinnote.refresh');
      });
      return;
    }
  }
}