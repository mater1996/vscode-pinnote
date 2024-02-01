import * as path from 'path';
import * as vscode from 'vscode';
import { workspace } from 'vscode';
import { ExplorerItem } from './ExplorerDataProvider';
import { isDirectory } from './utils';

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
      (await isDirectory(target.resourceUri)) &&
      transferItemAppContent
    ) {
      transferItemAppContent.value?.forEach((v: ExplorerItem) => {
        const targetFilePath = path.join(target.path, v.label);
        workspace.fs.rename(v.resourceUri, vscode.Uri.file(targetFilePath));
        vscode.commands.executeCommand('pinnote.refresh');
      });
      return;
    }
  }
}
