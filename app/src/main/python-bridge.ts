import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

interface PendingRequest {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
}

export class PythonBridge {
  private process: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private buffer = '';
  private onProgress: ((progress: any) => void) | null = null;
  private lastStage: string = '';
  private readyResolve: (() => void) | null = null;

  private static ACTION_STAGES: Record<string, string> = {
    extract_audio: 'extracting_audio',
    transcribe: 'transcribing',
    extract_slides: 'extracting_slides',
    generate_summary: 'generating_summary',
    extract_knowledge_points: 'generating_flashcards',
  };

  constructor(
    private pythonPath: string = 'python',
    private scriptPath: string = '',
  ) {}

  static findPython(): string {
    const candidates = [
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    ];
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return p; } catch {}
    }
    return 'python';
  }

  async start(): Promise<void> {
    let scriptPath: string;
    if (app.isPackaged) {
      scriptPath = path.join(process.resourcesPath, 'engine', 'main.py');
    } else {
      scriptPath = this.scriptPath || path.join(__dirname, '..', '..', '..', '..', 'engine', 'main.py');
    }

    const resolvedPython = this.pythonPath || PythonBridge.findPython();
    console.log(`[PythonBridge] python: ${resolvedPython}, script: ${scriptPath}`);

    const resourcesRoot = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, '..', '..', '..', '..');

    // Add bin/ to PATH so Python subprocesses (whisper) can find ffmpeg
    const binDir = path.join(resourcesRoot, 'bin');
    const pathSep = process.platform === 'win32' ? ';' : ':';
    const existingPath = process.env.PATH || '';
    const augmentedPath = fs.existsSync(binDir)
      ? binDir + pathSep + existingPath
      : existingPath;

    this.process = spawn(resolvedPython, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        RESOURCES_ROOT: resourcesRoot,
        PATH: augmentedPath,
      },
    });

    this.process.stdout!.on('data', (data: Buffer) => {
      const raw = data.toString();
      console.log(`[Python stdout] ${raw.trim()}`);
      this.handleData(raw);
    });

    this.process.stderr!.on('data', (data: Buffer) => {
      console.error(`[Python stderr] ${data.toString().trim()}`);
    });

    this.process.on('error', (err) => {
      console.error(`[PythonBridge] spawn error: ${err.message}`);
      this.process = null;
    });

    this.process.on('close', (code) => {
      console.log(`[Python] Process exited with code ${code}`);
      if (this.readyResolve) {
        this.readyResolve = null;
      }
      for (const [id, { reject }] of this.pending) {
        reject(new Error(`Python process crashed (exit code ${code})`));
      }
      this.pending.clear();
      this.process = null;
    });

    // Wait for Python to emit "initialized" before accepting commands
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.readyResolve = null;
        reject(new Error('Python engine initialization timed out (120s)'));
      }, 120000);
      this.readyResolve = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
    console.log('[PythonBridge] Engine ready, accepting commands');
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.status === 'progress') {
          if (response.stage) this.lastStage = response.stage;
          if (response.stage === 'initialized' && this.readyResolve) {
            this.readyResolve();
            this.readyResolve = null;
          }
          if (this.onProgress) {
            this.onProgress({ ...response, stage: response.stage || this.lastStage });
          }
        } else if (response.id && this.pending.has(response.id)) {
          const { resolve, reject } = this.pending.get(response.id)!;
          this.pending.delete(response.id);
          if (response.status === 'error') {
            console.error(`[Python] Action error: ${response.error}`);
            reject(new Error(response.error || 'Unknown Python error'));
          } else {
            resolve(response);
          }
        } else if (!response.status && !response.id) {
          console.warn('[Python] Unknown message:', line.substring(0, 200));
        }
      } catch {
        console.warn('[Python] Malformed JSON:', line.substring(0, 200));
      }
    }
  }

  async send(action: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.process) {
      console.log('[Bridge] Python process not running, restarting...');
      await this.start();
    }

    const stage = PythonBridge.ACTION_STAGES[action];
    if (stage) this.lastStage = stage;

    const id = Math.random().toString(36).substring(2, 10);
    console.log(`[Bridge SEND] action=${action} id=${id} pending=${this.pending.size}`);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const cmd = JSON.stringify({ action, params, id }) + '\n';
      this.process!.stdin!.write(cmd);

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          console.error(`[Bridge TIMEOUT] action=${action} id=${id} pending=${this.pending.size}`);
          reject(new Error(`Timeout for action: ${action}`));
        }
      }, 1800000);
    });
  }

  setProgressHandler(handler: (progress: any) => void): void {
    this.onProgress = handler;
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
