import { useRef, useCallback, useEffect, useState } from 'react';
import { useAppStore } from './store/app-store';
import { useProjectStore } from './store/project-store';
import { useBatchStore } from './store/batch-store';
import { useProgressStore } from './store/progress-store';
import { VideoPlayer, VideoPlayerHandle } from './components/VideoPlayer';
import { NoteEditor } from './components/NoteEditor';
import { TimelinePanel } from './components/TimelinePanel';
import { ProcessingProgress } from './components/ProcessingProgress';
import { SettingsDialog } from './components/SettingsDialog';
import { FlashcardPanel } from './components/FlashcardPanel';
import { TtsPanel } from './components/TtsPanel';
import { ProjectHistory } from './components/ProjectHistory';
import { BatchQueuePanel } from './components/BatchQueuePanel';
import { ContinueWatching } from './components/ContinueWatching';
import { StudyDashboard } from './components/StudyDashboard';
import { QuestionBankPanel } from './components/QuestionBankPanel';
import { VideoSelector } from './components/VideoSelector';
import { UrlImportDialog } from './components/UrlImportDialog';
import { ExtractedSlide } from '@shared/types';

export default function App() {
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const {
    isProcessing, progress, setProgress, setProcessing,
    setSettingsOpen, settings, updateSettings,
  } = useAppStore();
  const {
    currentProject, setCurrentProject, notesContent, setNotesContent, updateProject,
  } = useProjectStore();
  const batchStore = useBatchStore();
  const progressStore = useProgressStore();

  const [slides, setSlides] = useState<ExtractedSlide[]>([]);
  const [videoDuration] = useState(0);
  const [videoCurrentTime] = useState(0);
  const [rightTab, setRightTab] = useState<'notes' | 'flashcards' | 'questions' | 'tts' | 'stats'>('notes');
  const [pdfPaths, setPdfPaths] = useState<string[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [videoSelectorKey, setVideoSelectorKey] = useState(0);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [isEmptyCollection, setIsEmptyCollection] = useState(false);

  useEffect(() => {
    window.electronAPI?.loadSettings().then((s: any) => {
      if (s) updateSettings(s);
    });
    progressStore.loadSessions();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onPipelineProgress) return;
    const handler = (data: any) => {
      setProgress(data);
      if (data.stage && currentProject) {
        updateProject({ status: data.stage });
      }
      const bs = useBatchStore.getState();
      if (bs.isRunning && bs.currentIndex >= 0) {
        // Map pipeline 0-100% to item 50-100% (first 50% is download)
        const pipelinePct = data.progress || 0;
        const itemPct = 50 + Math.round(pipelinePct * 0.5);
        bs.setItemProgress(bs.currentIndex, Math.min(itemPct, 100), data.stage || '');
      }
    };
    window.electronAPI.onPipelineProgress(handler);
    return () => {
      window.electronAPI?.removePipelineProgressListener?.();
    };
  }, [currentProject]);

  const handleImportVideo = useCallback(async () => {
    const filePath = await window.electronAPI?.selectVideoFile();
    if (!filePath) return;

    const videoName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'Untitled';
    const projectInfo = await window.electronAPI?.createProject(videoName);
    if (!projectInfo) return;
    if ('error' in projectInfo) {
      alert(projectInfo.error);
      return;
    }

    setCurrentProject({
      id: projectInfo.id,
      name: projectInfo.name,
      createdAt: Date.now(),
      folderPath: projectInfo.folderPath,
      videoPath: filePath,
      status: 'created',
    });

    setProcessing(true);
    setSlides([]);
    setNotesContent('');
    setPdfPaths([]);

    const result = await window.electronAPI?.runPipeline({
      videoPath: filePath,
      projectDir: projectInfo.folderPath,
      pdfPaths,
      settings,
    });

    setProcessing(false);

    if (result?.error) {
      updateProject({ status: 'error' });
      alert(`处理失败: ${result.error}`);
    } else {
      updateProject({ status: 'completed' });
      try {
        const notes = await window.electronAPI?.readTextFile(
          projectInfo.folderPath + '\\notes.md'
        );
        if (notes) setNotesContent(notes);
        const slidesData = await window.electronAPI?.readTextFile(
          projectInfo.folderPath + '\\slides-metadata.json'
        );
        if (slidesData) {
          const parsed = JSON.parse(slidesData);
          if (parsed.slides) setSlides(parsed.slides);
        }
      } catch {}
    }
  }, [settings, currentProject]);

  // Batch event listeners
  useEffect(() => {
    if (!window.electronAPI?.onBatchItemStart) return;

    window.electronAPI.onBatchItemStart(({ index }) => {
      batchStore.setCurrentIndex(index);
      batchStore.setItemStatus(index, 'processing');
    });

    window.electronAPI.onBatchItemComplete(({ index, status, error }) => {
      batchStore.setItemStatus(index, status as any, error);
    });

    window.electronAPI.onBatchDone(() => {
      batchStore.setRunning(false);
      batchStore.setCurrentIndex(-1);
      setProcessing(false);
      // Reload notes if current project exists
      const proj = useProjectStore.getState().currentProject;
      if (proj) {
        window.electronAPI?.readTextFile(proj.folderPath + '\\notes.md').then(n => {
          if (n) setNotesContent(n);
        });
        updateProject({ status: 'completed' });
      }
    });

    return () => {
      window.electronAPI?.removeBatchListeners?.();
    };
  }, []);

  const handleBatchImport = useCallback(async () => {
    const filePaths = await window.electronAPI?.selectVideoFiles();
    if (!filePaths || filePaths.length === 0) return;

    const items = [];
    for (const filePath of filePaths) {
      const videoName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'Untitled';
      const projectInfo = await window.electronAPI?.createProject(videoName);
      if (projectInfo) {
        items.push({
          videoPath: filePath,
          projectName: videoName,
          projectDir: projectInfo.folderPath,
          status: 'pending' as const,
          progress: 0,
          stage: '',
        });
      }
    }

    if (items.length === 0) return;

    batchStore.setItems(items);
    batchStore.setRunning(true);
    batchStore.setCurrentIndex(0);

    const batchParams = items.map((item) => ({
      videoPath: item.videoPath,
      projectDir: item.projectDir,
    }));

    window.electronAPI?.runBatch(batchParams, settings);
  }, [settings]);

  const handleCollectionImport = useCallback(async (name: string) => {
    if (!name.trim()) return;
    const projectInfo = await window.electronAPI?.createCollection(name.trim(), []);
    if (!projectInfo) return;
    if ('error' in projectInfo) {
      alert(projectInfo.error);
      return;
    }

    setCurrentProject({
      id: projectInfo.id,
      name: name.trim(),
      createdAt: Date.now(),
      folderPath: projectInfo.folderPath,
      videoPath: '',
      status: 'created',
    });
    setNotesContent('');
    setSlides([]);
    setIsEmptyCollection(true);
    setCollectionDialogOpen(false);
    setCollectionName('');
  }, []);

  const handleAddVideosToCollection = useCallback(async () => {
    const proj = useProjectStore.getState().currentProject;
    if (!proj) return;

    const filePaths = await window.electronAPI?.selectVideoFiles();
    if (!filePaths || filePaths.length === 0) return;

    const result = await window.electronAPI?.addVideosToProject(proj.folderPath, filePaths);
    if (!result || 'error' in result) return;

    const videos = (result as any).videos || [];
    const newVideos = videos.filter((v: any) => filePaths.includes(v.videoPath));

    const items = newVideos.map((v: any) => ({
      videoPath: v.videoPath,
      projectName: v.name,
      projectDir: proj.folderPath,
      videoSubDir: `videos/${v.id}`,
      status: 'pending' as const,
      progress: 0,
      stage: '',
    }));

    if (items.length === 0) return;

    batchStore.setItems(items);
    batchStore.setRunning(true);
    batchStore.setCurrentIndex(0);

    const batchParams = items.map((item: any) => ({
      videoPath: item.videoPath,
      projectDir: item.projectDir,
      videoSubDir: item.videoSubDir,
    }));

    window.electronAPI?.runBatch(batchParams, settings);
    setProcessing(true);
    setIsEmptyCollection(false);
  }, [settings]);

  const handleUrlDownload = useCallback(async (url: string, info: any) => {
    setUrlDialogOpen(false);

    if (info.isPlaylist && info.totalCount > 1) {
      // === Playlist mode: create collection ===
      const projectInfo = await window.electronAPI?.createCollection(info.title || '在线合集', []);
      if (!projectInfo) return;
      if ('error' in projectInfo) {
        alert(projectInfo.error);
        return;
      }

      setCurrentProject({
        id: projectInfo.id,
        name: info.title || '在线合集',
        createdAt: Date.now(),
        folderPath: projectInfo.folderPath,
        videoPath: '',
        status: 'created',
      });
      setNotesContent('');
      setSlides([]);
      setIsEmptyCollection(false);

      // Create video entries in project.json with proper names
      const videoNames = info.entries.map((e: any, i: number) => e.title || `视频 ${i + 1}`);
      const addResult = await window.electronAPI?.addVideosToProject(
        projectInfo.folderPath,
        videoNames.map(() => `__placeholder__`),
        videoNames,
      );
      if (!addResult || 'error' in addResult) {
        alert(`创建视频条目失败`);
        return;
      }

      const videos = (addResult as any).videos || [];

      // Build batch items
      const items = videos.map((v: any, i: number) => ({
        videoPath: '',
        projectName: videoNames[i],
        projectDir: projectInfo.folderPath,
        videoSubDir: `videos/${v.id}`,
        status: 'pending' as const,
        progress: 0,
        stage: '',
        videoId: v.id,
      }));

      batchStore.setItems(items);
      batchStore.setRunning(true);
      setProcessing(true);

      // Download + pipeline: download one, start pipeline immediately, then download next
      const queue: number[] = items.map((_, i) => i);
      let pipelineRunning = false;
      const pipelineQueue: number[] = [];

      function tryStartNextPipeline() {
        if (pipelineRunning || pipelineQueue.length === 0) return;
        const idx = pipelineQueue.shift()!;
        pipelineRunning = true;
        batchStore.setCurrentIndex(idx);
        const item = items[idx];
        const dir = item.projectDir + '\\' + item.videoSubDir.replace(/\//g, '\\');

        window.electronAPI?.runPipeline({
          videoPath: item.videoPath,
          projectDir: dir,
          pdfPaths: [],
          settings,
        }).then(async (result: any) => {
          pipelineRunning = false;
          if (result?.error) {
            batchStore.setItemStatus(idx, 'error', result.error);
          } else {
            batchStore.setItemStatus(idx, 'completed');
            batchStore.setItemProgress(idx, 100, 'completed');
          }
          // Refresh video selector to show updated status
          setVideoSelectorKey((k) => k + 1);

          // If this is the currently selected video, load its notes immediately
          const curId = useProjectStore.getState().currentProject?.folderPath;
          if (curId && currentVideoId === items[idx].videoId) {
            const notes = await window.electronAPI?.readTextFile(dir + '\\notes.md');
            if (notes) setNotesContent(notes);
            try {
              const slidesData = await window.electronAPI?.readTextFile(dir + '\\slides-metadata.json');
              if (slidesData) {
                const parsed = JSON.parse(slidesData);
                setSlides(parsed.slides || []);
              }
            } catch {}
          }

          // Check if all done
          const allDone = items.every((_, i) => {
            const st = batchStore.items[i]?.status;
            return st === 'completed' || st === 'error';
          });
          if (allDone) {
            batchStore.setRunning(false);
            setProcessing(false);
            window.electronAPI?.removeVideoDownloadProgressListener?.();
            setDownloadProgress(0);
          } else {
            tryStartNextPipeline();
          }
        });
      }

      window.electronAPI?.onVideoDownloadProgress((pct) => {
        // Map download 0-100% to item progress 0-50%
        const current = items.findIndex((_, i) => batchStore.items[i]?.status === 'processing' && batchStore.items[i]?.progress < 50);
        if (current >= 0) {
          batchStore.setItemProgress(current, Math.round(pct * 0.5), '下载中');
        }
        setDownloadProgress(pct);
      });

      // Download videos one by one, queue pipeline immediately after each
      for (let i = 0; i < items.length; i++) {
        batchStore.setItemStatus(i, 'processing');
        batchStore.setItemProgress(i, 0, '下载中');

        const downloadDir = items[i].projectDir + '\\' + items[i].videoSubDir.replace(/\//g, '\\');

        const downloadResult = await window.electronAPI?.downloadPlaylistVideo({
          playlistUrl: url,
          videoIndex: i,
          projectDir: downloadDir,
        });

        if (downloadResult?.error) {
          batchStore.setItemStatus(i, 'error', downloadResult.error);
          continue;
        }

        const videoPath = downloadResult?.filePath || '';
        items[i].videoPath = videoPath;
        await window.electronAPI?.updateVideoPath(items[i].projectDir, items[i].videoId, videoPath);
        batchStore.setItemProgress(i, 45, '下载完成');
        setVideoSelectorKey((k) => k + 1);

        // If this is the first video, set it as current and start playing
        if (i === 0) {
          setCurrentVideoId(items[i].videoId);
          updateProject({ videoPath });
        }

        // Queue this item for pipeline processing
        pipelineQueue.push(i);
        tryStartNextPipeline();
      }

      window.electronAPI?.removeVideoDownloadProgressListener?.();
      setDownloadProgress(0);

      // If nothing entered pipeline (all downloads failed)
      if (pipelineQueue.length === 0 && !pipelineRunning) {
        batchStore.setRunning(false);
        setProcessing(false);
      }
      return;
    }

    // === Single video mode ===
    const existingProj = useProjectStore.getState().currentProject;
    let projectDir: string;
    let videoSubDir: string | undefined;
    let targetVideoId: string | undefined;

    if (existingProj) {
      projectDir = existingProj.folderPath;
      const addResult = await window.electronAPI?.addVideosToProject(projectDir, ['__url__']);
      const metaStr = await window.electronAPI?.readTextFile(projectDir + '\\project.json');
      const meta = metaStr ? JSON.parse(metaStr) : {};
      const newVideo = (meta.videos || []).find((v: any) => v.videoPath === '__url__');
      if (newVideo) {
        newVideo.name = info.title || 'Online Video';
        targetVideoId = newVideo.id;
        videoSubDir = `videos/${newVideo.id}`;
      }
      setIsEmptyCollection(false);
    } else {
      const projectInfo = await window.electronAPI?.createProject(info.title || 'Online Video');
      if (!projectInfo) return;
      projectDir = projectInfo.folderPath;
      setCurrentProject({
        id: projectInfo.id,
        name: info.title || projectInfo.name,
        createdAt: Date.now(),
        folderPath: projectInfo,
        videoPath: '',
        status: 'created',
      });
      setNotesContent('');
      setSlides([]);
    }

    setProcessing(true);
    setDownloadProgress(0);
    window.electronAPI?.onVideoDownloadProgress((pct) => setDownloadProgress(pct));

    let downloadDir = projectDir;
    if (videoSubDir) {
      downloadDir = projectDir + '\\' + videoSubDir.replace(/\//g, '\\');
    }

    const downloadResult = await window.electronAPI?.downloadVideoFromUrl({
      url,
      projectDir: downloadDir,
    });

    window.electronAPI?.removeVideoDownloadProgressListener?.();
    setDownloadProgress(0);

    if (downloadResult?.error) {
      setProcessing(false);
      updateProject({ status: 'error' });
      alert(`下载失败: ${downloadResult.error}`);
      return;
    }

    const videoPath = downloadResult?.filePath || '';
    updateProject({ videoPath });

    if (targetVideoId) {
      await window.electronAPI?.updateVideoPath(projectDir, targetVideoId, videoPath);
    }

    const result = await window.electronAPI?.runPipeline({
      videoPath,
      projectDir: downloadDir,
      pdfPaths,
      settings,
    });

    setProcessing(false);

    if (result?.error) {
      updateProject({ status: 'error' });
      alert(`处理失败: ${result.error}`);
    } else {
      updateProject({ status: 'completed' });
      try {
        const notes = await window.electronAPI?.readTextFile(downloadDir + '\\notes.md');
        if (notes) setNotesContent(notes);
        const slidesData = await window.electronAPI?.readTextFile(downloadDir + '\\slides-metadata.json');
        if (slidesData) {
          const parsed = JSON.parse(slidesData);
          if (parsed.slides) setSlides(parsed.slides);
        }
      } catch {}
    }
  }, [settings, pdfPaths]);

  const handleStartAnalysis = useCallback(async (projectDir: string, videoPath?: string) => {
    const metaStr = await window.electronAPI?.readTextFile(projectDir + '\\project.json');
    if (!metaStr) { alert('项目信息不存在'); return; }
    const meta = JSON.parse(metaStr);

    if (meta.type === 'multi' && meta.videos?.length > 0) {
      // Collection: process videos one by one
      const pending = meta.videos.filter((v: any) => v.status !== 'completed' && v.videoPath);
      if (pending.length === 0) { alert('没有需要分析的视频'); return; }

      const items = pending.map((v: any) => ({
        videoPath: v.videoPath,
        projectName: v.name,
        projectDir,
        videoSubDir: `videos/${v.id}`,
        status: 'pending' as const,
        progress: 0,
        stage: '',
        videoId: v.id,
      }));

      batchStore.setItems(items);
      batchStore.setRunning(true);
      setProcessing(true);

      // Process one video at a time
      for (let i = 0; i < items.length; i++) {
        batchStore.setItemStatus(i, 'processing');
        batchStore.setCurrentIndex(i);
        batchStore.setItemProgress(i, 5, 'extracting_audio');

        const dir = projectDir + '\\' + items[i].videoSubDir.replace(/\//g, '\\');
        const result = await window.electronAPI?.runPipeline({
          videoPath: items[i].videoPath,
          projectDir: dir,
          pdfPaths: [],
          settings,
        });

        if (result?.error) {
          batchStore.setItemStatus(i, 'error', result.error);
        } else {
          batchStore.setItemStatus(i, 'completed');
          batchStore.setItemProgress(i, 100, 'completed');
        }

        // Refresh video selector to show updated status
        setVideoSelectorKey((k) => k + 1);

        // Auto-select first completed video so user can study immediately
        if (i === 0 && !result?.error) {
          setCurrentVideoId(items[i].videoId);
          updateProject({ videoPath: items[i].videoPath });
          const notes = await window.electronAPI?.readTextFile(dir + '\\notes.md');
          if (notes) setNotesContent(notes);
          try {
            const slidesData = await window.electronAPI?.readTextFile(dir + '\\slides-metadata.json');
            if (slidesData) {
              const parsed = JSON.parse(slidesData);
              if (parsed.slides) setSlides(parsed.slides);
            }
          } catch {}
        }
      }

      // Merge notes for the whole collection
      batchStore.setRunning(false);
      batchStore.setCurrentIndex(-1);
      setProcessing(false);
      updateProject({ status: 'completed' });
    } else {
      // Single video project
      const vp = videoPath || meta.videoPath;
      if (!vp) { alert('视频路径不存在'); return; }

      setProcessing(true);
      updateProject({ status: 'created' });

      const result = await window.electronAPI?.runPipeline({
        videoPath: vp,
        projectDir,
        pdfPaths,
        settings,
      });

      setProcessing(false);

      if (result?.error) {
        updateProject({ status: 'error' });
        alert(`处理失败: ${result.error}`);
      } else {
        updateProject({ status: 'completed' });
        try {
          const notes = await window.electronAPI?.readTextFile(projectDir + '\\notes.md');
          if (notes) setNotesContent(notes);
          const slidesData = await window.electronAPI?.readTextFile(projectDir + '\\slides-metadata.json');
          if (slidesData) {
            const parsed = JSON.parse(slidesData);
            if (parsed.slides) setSlides(parsed.slides);
          }
        } catch {}
      }
    }
  }, [settings, pdfPaths]);

  const handleTimestampClick = useCallback((seconds: number) => {
    videoPlayerRef.current?.seekTo(seconds);
  }, []);

  const handleSelectProject = useCallback(async (p: any) => {
    // End previous session
    const prevId = useProgressStore.getState().currentProjectId;
    if (prevId) {
      await useProgressStore.getState().endSession();
    }

    setCurrentProject({
      id: p.id,
      name: p.name || p.id,
      folderPath: p.folderPath,
      videoPath: p.videoPath || '',
      createdAt: p.createdAt,
      status: p.hasNotes ? 'completed' : 'created',
    });

    // Load progress and start session
    await progressStore.loadPlayback(p.folderPath);
    progressStore.startSession(p.id);

    // Load slides for timeline
    try {
      const data = await window.electronAPI?.readTextFile(p.folderPath + '\\slides-metadata.json');
      if (data) {
        const parsed = JSON.parse(data);
        setSlides(parsed.slides || []);
      } else {
        setSlides([]);
      }
    } catch {
      setSlides([]);
    }
    // Check if this is an empty collection
    const isMultiEmpty = (p.type === 'multi') && (!p.videos || p.videos.length === 0);
    setIsEmptyCollection(isMultiEmpty);
    if (p.hasNotes) {
      const notes = await window.electronAPI?.readTextFile(p.folderPath + '\\notes.md');
      setNotesContent(notes || '');
    } else {
      setNotesContent('');
    }
  }, []);

  const handleCloseProject = useCallback(async () => {
    // Save final playback position and end session
    const proj = useProjectStore.getState().currentProject;
    if (proj) {
      await progressStore.savePlayback(proj.folderPath);
      await progressStore.endSession();
    }
    progressStore.resetPlayback();
    setCurrentProject(null);
    setNotesContent('');
    setSlides([]);
    setIsEmptyCollection(false);
  }, []);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    if (currentProject?.id === projectId) {
      await handleCloseProject();
    }
  }, [currentProject, handleCloseProject]);

  return (
    <>
      {/* Toolbar */}
      <header className="toolbar">
        <div className="toolbar-brand">
          <h1>CourseNote</h1>
          <span>课程总结</span>
        </div>
        {currentProject && (
          <>
            <button
              onClick={handleCloseProject}
              className="btn-ghost"
              style={{ marginLeft: '12px', fontSize: '12px' }}
            >
              关闭项目
            </button>
            <button
              className="btn-ghost"
              style={{ fontSize: '12px' }}
              onClick={() => window.electronAPI?.openProjectFolder(currentProject.folderPath)}
            >
              打开目录
            </button>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <ProjectHistory
            currentProjectId={currentProject?.id || null}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
          />
          {!currentProject && (
            <>
              <button
                onClick={handleImportVideo}
                disabled={isProcessing}
                className="btn-primary"
              >
                {isProcessing ? '处理中...' : '导入视频'}
              </button>
              <button
                onClick={() => setCollectionDialogOpen(true)}
                disabled={isProcessing}
                className="btn-ghost"
              >
                创建合集
              </button>
              <button
                onClick={() => setUrlDialogOpen(true)}
                disabled={isProcessing}
                className="btn-ghost"
              >
                在线课程
              </button>
              <button
                className="btn-ghost"
                onClick={async () => {
                  const result = await window.electronAPI?.importProject();
                  if (result?.error) {
                    alert(`导入失败: ${result.error}`);
                  }
                }}
              >
                导入项目
              </button>
            </>
          )}
          {currentProject && (
            <>
              <button
                className="btn-ghost"
                disabled={isProcessing}
                onClick={async () => {
                  const paths = await window.electronAPI?.selectPDFFiles();
                  if (paths && paths.length > 0) {
                    setPdfPaths(paths);
                  }
                }}
              >
                {pdfPaths.length > 0 ? `课件 (${pdfPaths.length})` : '附加课件'}
              </button>
              <button
                onClick={handleBatchImport}
                disabled={isProcessing || batchStore.isRunning}
                className="btn-ghost"
              >
                批量导入
              </button>
            </>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="btn-ghost"
          >
            设置
          </button>
        </div>
      </header>

      {/* Main content */}
      {!currentProject ? (
        <ContinueWatching
          onSelectProject={handleSelectProject}
          onImportVideo={handleImportVideo}
          onCreateCollection={() => setCollectionDialogOpen(true)}
          onImportProject={async () => {
            const result = await window.electronAPI?.importProject();
            if (result?.error) {
              alert(`导入失败: ${result.error}`);
            }
          }}
          onDeleteProject={handleDeleteProject}
          onOnlineCourse={() => setUrlDialogOpen(true)}
          onStartAnalysis={async (projectDir) => {
            const list = await window.electronAPI?.listProjects();
            const proj = (list as any[])?.find((p: any) => p.folderPath === projectDir);
            if (proj) {
              await handleSelectProject(proj);
              handleStartAnalysis(projectDir, proj.videoPath);
            }
          }}
        />
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Video + Timeline */}
          <div style={{ width: '55%', display: 'flex', flexDirection: 'column' }}>
            {currentProject.folderPath && (
              <VideoSelector
                projectDir={currentProject.folderPath}
                currentVideoId={currentVideoId}
                refreshKey={videoSelectorKey}
                onAddVideos={handleAddVideosToCollection}
                onSelect={async (v) => {
                  setCurrentVideoId(v.id);
                  updateProject({ videoPath: v.videoPath });
                  // Load per-video notes if available
                  const videoDir = currentProject.folderPath + '\\videos\\' + v.id;
                  const notes = await window.electronAPI?.readTextFile(videoDir + '\\notes.md');
                  if (notes) {
                    setNotesContent(notes);
                  } else {
                    // Fall back to merged project notes
                    const projNotes = await window.electronAPI?.readTextFile(currentProject.folderPath + '\\notes.md');
                    setNotesContent(projNotes || '');
                  }
                  // Load slides for this video
                  try {
                    const data = await window.electronAPI?.readTextFile(videoDir + '\\slides-metadata.json');
                    if (data) {
                      const parsed = JSON.parse(data);
                      setSlides(parsed.slides || []);
                    } else {
                      setSlides([]);
                    }
                  } catch { setSlides([]); }
                }}
              />
            )}
            {isEmptyCollection && !(currentProject?.videoPath) ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', gap: 20, padding: 40 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(212,168,83,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>添加视频开始学习</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    onClick={handleAddVideosToCollection}
                    style={{
                      padding: '12px 28px',
                      background: 'var(--accent)', border: 'none', borderRadius: 10,
                      color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    本地视频
                  </button>
                  <button
                    onClick={() => setUrlDialogOpen(true)}
                    style={{
                      padding: '12px 28px',
                      background: 'rgba(100,149,237,0.15)', border: '1px solid rgba(100,149,237,0.3)', borderRadius: 10,
                      color: '#6495ED', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    在线下载
                  </button>
                </div>
              </div>
            ) : (
              <VideoPlayer
                ref={videoPlayerRef}
                videoPath={currentProject?.videoPath || null}
                projectDir={currentProject?.folderPath ?? null}
              />
            )}
            <TimelinePanel
              duration={videoDuration}
              currentTime={videoCurrentTime}
              slides={slides}
              onSeek={(s) => videoPlayerRef.current?.seekTo(s)}
            />
          </div>

          {/* Divider */}
          <div className="panel-divider" />

          {/* Right panel with tabs */}
          <div style={{ width: '45%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
            {/* Tab header */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)' }}>
              <button
                className={`tab-btn ${rightTab === 'notes' ? 'active' : ''}`}
                onClick={() => setRightTab('notes')}
              >
                笔记
              </button>
              <button
                className={`tab-btn ${rightTab === 'flashcards' ? 'active' : ''}`}
                onClick={() => setRightTab('flashcards')}
              >
                知识卡片
              </button>
              <button
                className={`tab-btn ${rightTab === 'questions' ? 'active' : ''}`}
                onClick={() => setRightTab('questions')}
              >
                题库
              </button>
              {settings.ttsEnabled && (
                <button
                  className={`tab-btn ${rightTab === 'tts' ? 'active' : ''}`}
                  onClick={() => setRightTab('tts')}
                >
                  语音合成
                </button>
              )}
              <button
                className={`tab-btn ${rightTab === 'stats' ? 'active' : ''}`}
                onClick={() => setRightTab('stats')}
                style={{ marginLeft: 'auto' }}
              >
                学习统计
              </button>
              {currentProject?.status === 'completed' && notesContent && (
                <>
                <button
                  className="btn-ghost"
                  style={{ fontSize: '11px', padding: '4px 10px', marginRight: '4px' }}
                  onClick={async () => {
                    const result = await window.electronAPI?.exportPPTX(currentProject.folderPath);
                    if (result?.error) {
                      alert(`导出失败: ${result.error}`);
                    }
                  }}
                >
                  导出 PPT
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: '11px', padding: '4px 10px', marginRight: '4px' }}
                  onClick={async () => {
                    const result = await window.electronAPI?.exportProject(currentProject.folderPath);
                    if (result?.error) alert(`导出失败: ${result.error}`);
                  }}
                >
                  导出项目
                </button>
                </>
              )}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              {isProcessing && !notesContent && <ProcessingProgress progress={progress} />}

              {!isProcessing && rightTab === 'notes' && notesContent && (
                <div className="note-editor-container">
                  <NoteEditor
                    content={notesContent}
                    onContentChange={setNotesContent}
                    onTimestampClick={handleTimestampClick}
                    projectDir={currentVideoId ? currentProject.folderPath + '\\videos\\' + currentVideoId : currentProject.folderPath}
                  />
                </div>
              )}

              {!isProcessing && rightTab === 'flashcards' && notesContent && (
                <FlashcardPanel
                  projectDir={currentVideoId ? currentProject.folderPath + '\\videos\\' + currentVideoId : currentProject.folderPath}
                  onTimestampClick={handleTimestampClick}
                />
              )}

              {!isProcessing && rightTab === 'questions' && notesContent && (
                <QuestionBankPanel
                  projectDir={currentVideoId ? currentProject.folderPath + '\\videos\\' + currentVideoId : currentProject.folderPath}
                  notesContent={notesContent}
                  onTimestampClick={handleTimestampClick}
                />
              )}

              {!isProcessing && rightTab === 'tts' && notesContent && (
                <TtsPanel
                  projectDir={currentVideoId ? currentProject.folderPath + '\\videos\\' + currentVideoId : currentProject.folderPath}
                  notesContent={notesContent}
                />
              )}

              {!isProcessing && rightTab === 'stats' && (
                <StudyDashboard />
              )}

              {!isProcessing && rightTab !== 'stats' && !notesContent && (
                <div className="empty-state" style={{ background: 'var(--bg-base)' }}>
                  <div className="empty-state-icon" style={{ opacity: 0.3 }}>&#9997;</div>
                  <p>导入课程视频，自动生成图文笔记</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-8px' }}>
                    支持语音转录 · 幻灯片提取 · AI 智能总结 · 知识卡片
                  </p>
                  {currentProject && currentProject.videoPath && (
                    <button
                      onClick={() => handleStartAnalysis(currentProject.folderPath, currentProject.videoPath)}
                      style={{
                        marginTop: 16,
                        padding: '10px 24px',
                        background: 'var(--accent)',
                        border: 'none',
                        borderRadius: 8,
                        color: '#000',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      开始分析
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Queue Panel */}
      <BatchQueuePanel />

      {/* Settings Dialog */}
      <SettingsDialog />

      {/* URL Import Dialog */}
      <UrlImportDialog
        open={urlDialogOpen}
        onClose={() => setUrlDialogOpen(false)}
        onStartDownload={handleUrlDownload}
      />

      {/* Collection Create Dialog */}
      {collectionDialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={(e) => { if (e.target === e.currentTarget) { setCollectionDialogOpen(false); setCollectionName(''); } }}
        >
          <div style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '28px', width: 400 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>创建合集</div>
            <input
              type="text"
              placeholder={'输入合集名称（如"资料分析"）'}
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && collectionName.trim()) handleCollectionImport(collectionName); }}
              autoFocus
              style={{
                width: '100%', padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => { setCollectionDialogOpen(false); setCollectionName(''); }} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>取消</button>
              <button onClick={() => handleCollectionImport(collectionName)} disabled={!collectionName.trim()} style={{ padding: '8px 18px', background: collectionName.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: collectionName.trim() ? '#000' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: collectionName.trim() ? 'pointer' : 'not-allowed' }}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Download progress overlay */}
      {isProcessing && downloadProgress > 0 && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20,
          background: '#1a1a22',
          border: '1px solid rgba(212,168,83,0.3)',
          borderRadius: 10,
          padding: '12px 20px',
          zIndex: 999,
          fontSize: 12,
          color: 'var(--text-primary)',
        }}>
          <div style={{ marginBottom: 6 }}>下载中... {Math.round(downloadProgress)}%</div>
          <div style={{ width: 200, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${downloadProgress}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}
    </>
  );
}
