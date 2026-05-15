import { useState, useEffect } from 'react';

interface VideoEntry {
  title: string;
  url: string;
  duration: number;
  index: number;
}

interface VideoInfoData {
  title: string;
  isPlaylist: boolean;
  totalCount: number;
  entries: VideoEntry[];
  uploader: string;
  thumbnail: string;
}

interface UrlImportDialogProps {
  open: boolean;
  onClose: () => void;
  onStartDownload: (url: string, info: VideoInfoData) => void;
}

export function UrlImportDialog({ open, onClose, onStartDownload }: UrlImportDialogProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<VideoInfoData | null>(null);
  const [error, setError] = useState('');
  const [ytDlpStatus, setYtDlpStatus] = useState<{ installed: boolean; version?: string } | null>(null);

  useEffect(() => {
    if (open) {
      window.electronAPI?.checkYtDlp().then(setYtDlpStatus);
    }
  }, [open]);

  if (!open) return null;

  async function handleFetchInfo() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setInfo(null);
    try {
      const result = await window.electronAPI?.getVideoInfo(url.trim());
      if (result?.error) {
        setError(result.error);
      } else if (result?.info) {
        setInfo(result.info);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  function formatDuration(seconds: number): string {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatTotalDuration(entries: VideoEntry[]): string {
    const total = entries.reduce((sum, e) => sum + (e.duration || 0), 0);
    if (!total) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return `${h}小时${m}分钟`;
    return `${m}分钟`;
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#1a1a22',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: '28px',
        width: 520,
        maxWidth: '90vw',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>
          在线课程下载
        </div>

        {!ytDlpStatus?.installed && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(255,107,107,0.1)',
            border: '1px solid rgba(255,107,107,0.2)',
            borderRadius: 8,
            color: '#ff6b6b',
            fontSize: 12,
            marginBottom: 16,
          }}>
            yt-dlp 未安装。请运行: pip install yt-dlp
          </div>
        )}

        {/* URL input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="粘贴视频链接 (YouTube, B站, 等)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleFetchInfo(); }}
            style={{
              flex: 1,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={handleFetchInfo}
            disabled={loading || !url.trim()}
            style={{
              padding: '10px 18px',
              background: 'rgba(212,168,83,0.15)',
              border: '1px solid rgba(212,168,83,0.3)',
              borderRadius: 8,
              color: 'var(--accent)',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '获取中...' : '获取信息'}
          </button>
        </div>

        {error && (
          <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 12, padding: '8px 12px', background: 'rgba(255,107,107,0.06)', borderRadius: 6 }}>
            {error}
          </div>
        )}

        {/* Video/Playlist info preview */}
        {info && (
          <div style={{
            padding: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10,
            marginBottom: 16,
          }}>
            {info.isPlaylist ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    padding: '2px 8px',
                    background: 'rgba(100,149,237,0.15)',
                    border: '1px solid rgba(100,149,237,0.3)',
                    borderRadius: 4,
                    color: '#6495ED',
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    合集
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {info.title}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  <span>{info.totalCount} 个视频</span>
                  {formatTotalDuration(info.entries) && <span>总时长 {formatTotalDuration(info.entries)}</span>}
                  {info.uploader && <span>{info.uploader}</span>}
                </div>
                <div style={{ maxHeight: 150, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                  {info.entries.slice(0, 20).map((entry, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
                      {entry.duration > 0 && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatDuration(entry.duration)}</span>}
                    </div>
                  ))}
                  {info.totalCount > 20 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0', textAlign: 'center' }}>
                      ...还有 {info.totalCount - 20} 个视频
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {info.title}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  {info.uploader && <span>{info.uploader}</span>}
                  {info.entries[0]?.duration > 0 && <span>{formatDuration(info.entries[0].duration)}</span>}
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            onClick={() => { if (info) onStartDownload(url, info); }}
            disabled={!info}
            style={{
              padding: '8px 18px',
              background: info ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: 8,
              color: info ? '#000' : 'var(--text-muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: info ? 'pointer' : 'not-allowed',
            }}
          >
            {info?.isPlaylist ? `下载合集 (${info.totalCount}个视频)` : '下载并生成笔记'}
          </button>
        </div>
      </div>
    </div>
  );
}
