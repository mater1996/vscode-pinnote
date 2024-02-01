import fs from 'fs';
import { FileType } from 'vscode';
import { workspace } from 'vscode';
import { Uri } from 'vscode';

export async function isDirectory(uri: Uri) {
  return (await workspace.fs.stat(uri)).type === FileType.Directory;
}

export async function fileExists(uri: Uri) {
  try {
    return !!(fs.existsSync(uri.path));
  } catch (error) {
    return false;
  }
}
