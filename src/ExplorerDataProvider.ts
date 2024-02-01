import * as vscode from 'vscode';
import * as path from 'path';
import { Uri } from 'vscode';
import { isDirectory } from './utils';
import { workspace } from 'vscode';

export class ExplorerItem extends vscode.TreeItem {
  resourceUri: vscode.Uri;

  constructor(
    public readonly label: string,
    public readonly path: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parent?: ExplorerItem
  ) {
    super(label, collapsibleState);
    this.resourceUri = vscode.Uri.file(this.path);
  }
}

export class ExplorerDataProvider
  implements vscode.TreeDataProvider<ExplorerItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItem | undefined> =
    new vscode.EventEmitter<ExplorerItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<ExplorerItem | undefined> =
    this._onDidChangeTreeData.event;

  constructor(
    private files: string[],
    public context: vscode.ExtensionContext
  ) {}

  // 实现 getChildren 方法，返回资源视图的子项
  async getChildren(element?: ExplorerItem) {
    if (element) {
      if (await isDirectory(element.resourceUri)) {
        const subFiles = await getFilesInDirectory(
          vscode.Uri.file(element.path)
        );
        const children = await Promise.all(
          subFiles.map(async subFile => {
            const d = await isDirectory(Uri.file(subFile));
            const label = path.basename(subFile);
            return new ExplorerItem(
              label,
              subFile,
              d
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
              element
            );
          })
        );
        return children;
      } else {
        return Promise.resolve([]); // 如果是文件，则没有子项
      }
    } else {
      // 返回根级别的项，即输入路径下的文件和文件夹
      const rootItems = await Promise.all(
        this.files.map(async file => {
          const label = path.basename(file);
          const uri = Uri.file(file);
          const d = await isDirectory(uri);
          return new ExplorerItem(
            label,
            file,
            d
              ? vscode.TreeItemCollapsibleState.Collapsed
              : vscode.TreeItemCollapsibleState.None
          );
        })
      );
      return Promise.resolve(rootItems);
    }
  }

  // 实现 getParent 方法，返回给定项的父项
  getParent(element: ExplorerItem): ExplorerItem | null {
    return element.parent || null;
  }

  // 实现 getTreeItem 方法，返回给定项的 TreeItem
  getTreeItem(element: ExplorerItem): vscode.TreeItem {
    return element;
  }

  // 刷新资源视图
  refresh(): void {
    // @ts-ignore
    this._onDidChangeTreeData.fire();
  }
}

// 获取路径下的所有文件和文件夹
async function getFilesInDirectory(uri: vscode.Uri) {
  const files = await workspace.fs.readDirectory(uri);
  const filePaths = files
    .map(([file]) => path.join(uri.fsPath, file))
    .filter(v => !/.git$/.test(v));
  return filePaths;
}
