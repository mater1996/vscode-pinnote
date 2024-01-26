// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
  const cachedPath: string | undefined =
    context.globalState.get<string>('pinnote.cachedPath');
  cachedPath && openFolder(cachedPath);
  // 注册命令以显示路径下的文件
  context.subscriptions.push(
    vscode.commands.registerCommand('pinnote.openNote', async () => {
      const selectedPath = await vscode.window.showInputBox({
        placeHolder: 'Note path',
        prompt: 'Enter the path you want to explore'
      });
      if (selectedPath) {
        context.globalState.update('pinnote.cachedPath', selectedPath);
        openFolder(selectedPath);
      }
    })
  );
}

async function openFolder(selectedPath: string) {
  const uri = vscode.Uri.file(selectedPath);
  const files = await getFilesInDirectory(uri);
  // 创建资源视图
  const treeDataProvider = new ExplorerDataProvider(files);
  const treeView = vscode.window.createTreeView('pinnote', {
    treeDataProvider
  });
  treeView.onDidChangeSelection(e => {
    const selectedItem = e.selection[0] as ExplorerItem;
    if (selectedItem && !fs.statSync(selectedItem.path).isDirectory()) {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(selectedItem.path)
      );
    }
  });
}

class ExplorerDataProvider implements vscode.TreeDataProvider<ExplorerItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItem | undefined> =
    new vscode.EventEmitter<ExplorerItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<ExplorerItem | undefined> =
    this._onDidChangeTreeData.event;

  constructor(private files: string[]) {}

  // 实现 getChildren 方法，返回资源视图的子项
  getChildren(element?: ExplorerItem): Thenable<ExplorerItem[]> {
    if (element) {
      // 如果是文件夹，则递归获取其子项
      if (fs.statSync(element.path).isDirectory()) {
        return Promise.resolve(
          getFilesInDirectory(vscode.Uri.file(element.path)).then(subFiles =>
            subFiles.map(subFile => {
              const isDirectory = fs.statSync(subFile).isDirectory();
              return new ExplorerItem(
                path.basename(subFile),
                subFile,
                isDirectory
                  ? vscode.TreeItemCollapsibleState.Collapsed
                  : vscode.TreeItemCollapsibleState.None,
                element
              );
            })
          )
        );
      } else {
        return Promise.resolve([]); // 如果是文件，则没有子项
      }
    } else {
      // 返回根级别的项，即输入路径下的文件和文件夹
      const rootItems = this.files.map(file => {
        const isDirectory = fs.statSync(file).isDirectory();
        return new ExplorerItem(
          path.basename(file),
          file,
          isDirectory
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
      });
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
    this._onDidChangeTreeData.fire(undefined);
  }
}

class ExplorerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly path: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parent?: ExplorerItem
  ) {
    super(label, collapsibleState);
    // 设置图标
    // 设置 contextValue 以便匹配主题图标
    const isDirectory = fs.statSync(path).isDirectory();
    this.contextValue = isDirectory ? 'folder' : 'file';
    this.iconPath = isDirectory
      ? vscode.ThemeIcon.Folder
      : vscode.ThemeIcon.File;
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
        const filePaths = files.map(file => path.join(uri.fsPath, file));
        resolve(filePaths);
      }
    });
  });
}
