import { useEffect, useState } from 'react';

interface VideoEntry {
  id: string;
  name: string;
  videoPath: string;
  status: string;
}

interface Props {
  projectDir: string;
  currentVideoId: string | null;
  onSelect: (video: VideoEntry) => void;
  onAddVideos?: () => void;
  refreshKey?: number;
}

export function VideoSelector({ projectDir, currentVideoId, onSelect, onAddVideos, refreshKey }: Props) {
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [projectType, setProjectType] = useState<string>('single');

  useEffect(() => {
    loadMeta();
  }, [projectDir, refreshKey]);

  async function loadMeta() {
    const str = await window.electronAPI?.readTextFile(projectDir + '\\project.json');
    if (str) {
      const meta = JSON.parse(str);
      setVideos(meta.videos || []);
      setProjectType(meta.type || 'single');
      if (meta.videos?.length > 0 && !currentVideoId) {
        onSelect(meta.videos[0]);
      }
    }
  }

  // Single video project — no selector needed
  if (projectType !== 'multi' && videos.length <= 1) return null;

  return (
    <div className="video-selector">
      {videos.map((v) => (
        <button
          key={v.id}
          className={`video-selector-tab ${currentVideoId === v.id ? 'active' : ''}`}
          onClick={() => onSelect(v)}
        >
          <span className="video-selector-name">{v.name}</span>
          <span className={`video-selector-status ${v.status === 'completed' ? 'done' : ''}`}>
            {v.status === 'completed' ? '✓' : v.status === 'error' ? '✕' : v.status === 'downloaded' ? '↓' : '○'}
          </span>
        </button>
      ))}
      {onAddVideos && (
        <button
          className="video-selector-add"
          onClick={onAddVideos}
          title="添加视频"
        >
          + 添加视频
        </button>
      )}
    </div>
  );
}
