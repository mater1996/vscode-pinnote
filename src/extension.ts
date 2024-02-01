// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import fs from 'fs-extra';
import { ExplorerDataProvider, ExplorerItem } from './ExplorerDataProvider';
import { MyDragAndDropController } from './MyDragAndDropController';

declare module 'vscode' {
  interface TreeView<T> {
    rootPath?: string
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('pinnote.openNote', async () => {
      const selectedPath = await vscode.window.showInputBox({
        placeHolder: 'Note path',
        prompt: 'Enter the path you want to explore'
      });
      if (selectedPath) {
        context.globalState.update('pinnote.cachedPath', selectedPath);
        openNote(selectedPath, context);
      }
    })
  );
  const cachedPath = context.globalState.get<string>('pinnote.cachedPath');
  cachedPath && openNote(cachedPath, context);
}

async function openNote(
  selectedPath: string,
  context: vscode.ExtensionContext
) {
  const uri = vscode.Uri.file(selectedPath);
  const treeDataProvider = new ExplorerDataProvider([uri.fsPath], context);
  const treeDataProviderDispose = vscode.window.registerTreeDataProvider('pinnoteView', treeDataProvider);
  const treeView = vscode.window.createTreeView('pinnoteView', {
    treeDataProvider,
    canSelectMany: true,
    showCollapseAll: true,
    dragAndDropController: new MyDragAndDropController(
      ['application/vnd.code.tree.pinnoteView'],
      ['application/vnd.code.tree.pinnoteView']
    )
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

  treeView.title = path.basename(selectedPath).toUpperCase();

  context.subscriptions.push(
    treeView,
    treeDataProviderDispose,
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


