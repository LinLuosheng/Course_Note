import { useState, useEffect, useRef } from 'react';

interface ProjectInfo {
  id: string;
  name: string;
  videoPath: string;
  folderPath: string;
  hasNotes: boolean;
  hasFlashcards: boolean;
  hasTranscript: boolean;
  createdAt: number;
  progressPct?: number;
  lastWatchedAt?: number;
}

interface ProjectHistoryProps {
  currentProjectId: string | null;
  onSelectProject: (project: ProjectInfo) => void;
  onDeleteProject: (projectId: string) => void;
}

function relativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
}

export function ProjectHistory({ currentProjectId, onSelectProject, onDeleteProject }: ProjectHistoryProps) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) loadProjects();
  }, [open]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function loadProjects() {
    const list = await window.electronAPI?.listProjects();
    if (list) setProjects(list as ProjectInfo[]);
  }

  async function handleDelete(e: React.MouseEvent, p: ProjectInfo) {
    e.stopPropagation();
    if (!confirm(`确定删除 "${p.name}" ？此操作不可恢复。`)) return;
    const result = await window.electronAPI?.deleteProject(p.folderPath);
    if (result?.success) {
      onDeleteProject(p.id);
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    }
  }

  function formatDate(ts: number) {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const completedCount = projects.filter((p) => p.hasNotes).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn-ghost" onClick={() => setOpen(!open)}>
        历史记录
        {completedCount > 0 && (
          <span style={{
            marginLeft: '6px',
            background: 'var(--accent)',
            color: 'var(--text-on-accent)',
            borderRadius: '10px',
            padding: '1px 7px',
            fontSize: '11px',
            fontWeight: 700,
          }}>
            {completedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '8px',
          width: '420px',
          maxHeight: '480px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          zIndex: 1000,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>
              历史记录
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              共 {projects.length} 个项目
            </span>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '6px' }}>
            {projects.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                暂无项目
              </div>
            )}
            {projects.map((p) => {
              const isActive = p.id === currentProjectId;
              const hasProgress = (p.progressPct || 0) > 0;
              return (
                <div
                  key={p.id}
                  onClick={() => { onSelectProject(p); setOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: isActive ? '1px solid var(--border-accent)' : hasProgress ? '1px solid rgba(212,168,83,0.2)' : '1px solid transparent',
                    background: isActive ? 'var(--accent-glow)' : 'transparent',
                    cursor: 'pointer',
                    marginBottom: '2px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      {p.lastWatchedAt ? relativeTime(p.lastWatchedAt) : formatDate(p.createdAt)}
                    </div>
                    {hasProgress && (
                      <div style={{
                        marginTop: '6px',
                        height: '3px',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.round((p.progressPct || 0) * 100)}%`,
                          background: 'var(--accent)',
                          borderRadius: '2px',
                          transition: 'width 0.3s',
                        }} />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0, alignItems: 'center' }}>
                    {p.hasNotes && (
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: 'rgba(92, 184, 122, 0.15)',
                        color: 'var(--success)',
                      }}>
                        笔记
                      </span>
                    )}
                    {p.hasFlashcards && (
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: 'var(--accent-glow)',
                        color: 'var(--accent)',
                      }}>
                        卡片
                      </span>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, p)}
                      title="删除"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--error)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                    >
                      &times;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
