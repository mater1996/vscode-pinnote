// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';

declare module 'vscode' {
  interface TreeView<T> {
    rootPath?: string
  }
}

export function activate(context: vscode.ExtensionContext) {
  const cachedPath = context.globalState.get<string>('pinnote.cachedPath');
  cachedPath && openFolder(cachedPath, context);
  context.subscriptions.push(
    vscode.commands.registerCommand('pinnote.openNote', async () => {
      const selectedPath = await vscode.window.showInputBox({
        placeHolder: 'Note path',
        prompt: 'Enter the path you want to explore'
      });
      if (selectedPath) {
        context.globalState.update('pinnote.cachedPath', selectedPath);
        openFolder(selectedPath, context);
      }
    })
  );
}

async function openFolder(
  selectedPath: string,
  context: vscode.ExtensionContext
) {
  const uri = vscode.Uri.file(selectedPath);
  // 创建资源视图
  const treeDataProvider = new ExplorerDataProvider([uri.fsPath], context);
  vscode.window.registerTreeDataProvider('pinnoteView', treeDataProvider);
  const treeView = vscode.window.createTreeView('pinnoteView', {
    treeDataProvider,
    canSelectMany: true,
    showCollapseAll: true,
    dragAndDropController: new MyDragAndDropController(
      ['application/vnd.code.tree.pinnoteView'],
      ['application/vnd.code.tree.pinnoteView']
    )
  });
  treeView.rootPath = selectedPath;
  treeView.onDidChangeSelection(e => {
    const selectedItem = e.selection[0] as ExplorerItem;
    if (selectedItem && !fs.statSync(selectedItem.path).isDirectory()) {
      vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.file(selectedItem.path)
      );
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('pinnote.refresh', () =>
      treeDataProvider.refresh()
    ),
    vscode.commands.registerCommand('pinnote.rename', (item: ExplorerItem) => {
      return vscode.window
        .showInputBox({ prompt: 'Enter a new name', value: item.label })
        .then(newName => {
          if (newName) {
            const newPath = path.join(
              path.dirname(item.resourceUri.fsPath),
              newName
            );
            vscode.workspace.fs.rename(
              item.resourceUri,
              vscode.Uri.file(newPath)
            );
            treeDataProvider.refresh();
          }
        });
    }),
    vscode.commands.registerCommand('pinnote.delete', (item: ExplorerItem) => {
      return vscode.workspace.fs
        .delete(item.resourceUri, { recursive: true, useTrash: true })
        .then(() => {
          treeDataProvider.refresh();
        });
    }),
    vscode.commands.registerCommand('pinnote.newFile', (item: ExplorerItem) => {
      return vscode.window
        .showInputBox({ prompt: 'Enter new file name' })
        .then(async fileName => {
          if (fileName) {
            const rootPath =
              treeView.selection[0]?.path || treeView.rootPath || '';
            if (fs.statSync(rootPath).isDirectory()) {
              const filePath = path.join(rootPath, fileName);
              if (fs.existsSync(filePath)) {
                return vscode.window.showErrorMessage(
                  `File '${fileName}' already exists.`
                );
              }
              fs.writeFileSync(filePath, '');
              treeDataProvider.refresh();
              const document = await vscode.workspace.openTextDocument(filePath);
              await vscode.window.showTextDocument(document);
            }
          }
        });
    }),
    vscode.commands.registerCommand(
      'pinnote.newDirectory',
      (item: ExplorerItem) => {
        return vscode.window
          .showInputBox({ prompt: 'Enter new directory name' })
          .then(async directoryName => {
            if (directoryName) {
              const rootPath =
                treeView.selection[0]?.path || treeView.rootPath || '';
              console.log(rootPath);
              const directoryPath = path.join(rootPath, directoryName);
              if (fs.existsSync(directoryPath)) {
                return vscode.window.showErrorMessage(
                  `Directory '${directoryName}' already exists.`
                );
              }
              fs.mkdirSync(directoryPath);
              treeDataProvider.refresh();
            }
          });
      }
    )
  );
}

class MyDragAndDropController
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
    console.log(treeDataTransfer, source);
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

class ExplorerDataProvider implements vscode.TreeDataProvider<ExplorerItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItem | undefined> =
    new vscode.EventEmitter<ExplorerItem | undefined>();

  readonly onDidChangeTreeData: vscode.Event<ExplorerItem | undefined> =
    this._onDidChangeTreeData.event;

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
          getFilesInDirectory(vscode.Uri.file(element.path)).then(subFiles =>
            subFiles.map(subFile => {
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
            })
          )
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

class ExplorerItem extends vscode.TreeItem {
  resourceUri: vscode.Uri;

  constructor(
    public readonly label: string,
    public readonly path: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly parent?: ExplorerItem
  ) {
    super(label, collapsibleState);
    this.resourceUri = vscode.Uri.file(this.path);
    // 设置图标
    // 设置 contextValue 以便匹配主题图标
    const isDirectory = fs.statSync(path).isDirectory();
    this.contextValue = isDirectory ? 'folder' : 'file';
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
