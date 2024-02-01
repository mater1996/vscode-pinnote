import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';

export class ExplorerItem extends vscode.TreeItem {
  resourceUri: vscode.Uri;
  children: ExplorerItem[];

  constructor(
    public readonly label: string,
    public readonly path: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parent?: ExplorerItem
  ) {
    super(label, collapsibleState);
    this.resourceUri = vscode.Uri.file(this.path);
    this.children = [];
    // 设置图标
    // 设置 contextValue 以便匹配主题图标
    const isDirectory = fs.statSync(path).isDirectory();
    this.contextValue = isDirectory ? 'folder' : 'file';
  }
}


export class ExplorerDataProvider implements vscode.TreeDataProvider<ExplorerItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItem | undefined> =
    new vscode.EventEmitter<ExplorerItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<ExplorerItem | undefined> =
    this._onDidChangeTreeData.event;

  rootItems?: ExplorerItem[];

  constructor(
    private files: string[],
    public context: vscode.ExtensionContext
  ) {}

  // 实现 getChildren 方法，返回资源视图的子项
  getChildren(element?: ExplorerItem): Thenable<ExplorerItem[]> {
    if (element) {
      // 如果是文件夹，则递归获取其子项
      if (fs.statSync(element.path).isDirectory()) {
        return Promise.resolve(
          getFilesInDirectory(vscode.Uri.file(element.path)).then(subFiles => {
            const children = subFiles.map(subFile => {
              const isDirectory = fs.statSync(subFile).isDirectory();
              const label = path.basename(subFile);
              return new ExplorerItem(
                label,
                subFile,
                isDirectory
                  ? vscode.TreeItemCollapsibleState.Collapsed
                  : vscode.TreeItemCollapsibleState.None,
                element
              );
            });
            element.children = children;
            return children;
          })
        );
      } else {
        return Promise.resolve([]); // 如果是文件，则没有子项
      }
    } else {
      // 返回根级别的项，即输入路径下的文件和文件夹
      const rootItems = this.files.map(file => {
        const label = path.basename(file);
        const isDirectory = fs.statSync(file).isDirectory();
        return new ExplorerItem(
          label,
          file,
          isDirectory
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
      });
      this.rootItems = rootItems;
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
async function getFilesInDirectory(uri: vscode.Uri): Promise<string[]> {
  return new Promise(resolve => {
    fs.readdir(uri.fsPath, (err, files) => {
      if (err) {
        vscode.window.showErrorMessage(
          `Error reading directory: ${err.message}`
        );
        resolve([]);
      } else {
        const filePaths = files
          .map(file => path.join(uri.fsPath, file))
          .filter(v => !/.git$/.test(v));
        resolve(filePaths);
      }
    });
  });
}