import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
// @ts-expect-error archiver has no type declarations
import archiver from 'archiver';
import extract from 'extract-zip';
import { dialog, BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';
import { loadSettings } from './settings-manager';
import * as os from 'os';

const EXCLUDE_PATTERNS = ['audio.wav', 'tts'];

export async function exportProject(projectDir: string): Promise<{ outputPath?: string; error?: string }> {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showSaveDialog(win!, {
    title: '导出项目',
    defaultPath: path.basename(projectDir) + '.zip',
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return {};

  return new Promise((resolve) => {
    const output = fs.createWriteStream(result.filePath!);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', () => {
      resolve({ outputPath: result.filePath! });
    });
    archive.on('error', (err: Error) => {
      resolve({ error: err.message });
    });

    archive.pipe(output);
    archive.directory(projectDir, path.basename(projectDir), (entry: archiver.EntryData) => {
      for (const exc of EXCLUDE_PATTERNS) {
        if (entry.name.includes(exc)) return false;
      }
      return entry;
    });
    archive.finalize();
  });
}

export async function importProject(): Promise<{ id?: string; folderPath?: string; error?: string }> {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win!, {
    title: '导入项目',
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return {};

  const zipPath = result.filePaths[0];
  const s = loadSettings();
  const modelRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..', '..', '..');
  const projectsDir = (s as any).projectsDir || path.join(modelRoot, 'projects');
  const newId = nanoid();
  const projectDir = path.join(projectsDir, newId);

  try {
    fs.mkdirSync(projectDir, { recursive: true });
    await extract(zipPath, { dir: projectDir });

    // Find the actual project folder (zip might contain a subfolder)
    const entries = fs.readdirSync(projectDir);
    if (entries.length === 1 && fs.statSync(path.join(projectDir, entries[0])).isDirectory()) {
      // Move contents up
      const subDir = path.join(projectDir, entries[0]);
      for (const file of fs.readdirSync(subDir)) {
        fs.renameSync(path.join(subDir, file), path.join(projectDir, file));
      }
      fs.rmdirSync(subDir);
    }

    // Update project.json with new id and folder path
    const metaPath = path.join(projectDir, 'project.json');
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.id = newId;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }

    return { id: newId, folderPath: projectDir };
  } catch (error: any) {
    return { error: error.message };
  }
}
