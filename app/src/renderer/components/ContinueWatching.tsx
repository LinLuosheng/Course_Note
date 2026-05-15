import { useState, useEffect } from 'react';

interface ProjectWithProgress {
  id: string;
  name: string;
  videoPath: string;
  folderPath: string;
  hasNotes: boolean;
  hasFlashcards: boolean;
  createdAt: number;
  progressPct?: number;
  lastWatchedAt?: number;
  type?: 'single' | 'multi';
  videos?: { id: string; name: string; status: string }[];
}

interface ContinueWatchingProps {
  onSelectProject: (project: any) => void;
  onImportVideo?: () => void;
  onCreateCollection?: () => void;
  onImportProject?: () => void;
  onOnlineCourse?: () => void;
  onDeleteProject?: (projectId: string) => void;
  onStartAnalysis?: (projectDir: string) => void;
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
  return `${days}天前`;
}

export function ContinueWatching({ onSelectProject, onImportVideo, onCreateCollection, onImportProject, onOnlineCourse, onDeleteProject, onStartAnalysis }: ContinueWatchingProps) {
  const [projects, setProjects] = useState<ProjectWithProgress[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const list = await window.electronAPI?.listProjects();
    if (!list) return;
    const sorted = (list as any[] as ProjectWithProgress[]).sort((a, b) => {
      const ta = a.lastWatchedAt || a.createdAt || 0;
      const tb = b.lastWatchedAt || b.createdAt || 0;
      return tb - ta;
    });
    setProjects(sorted);
  }

  const filtered = search.trim()
    ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  // Empty state — no projects at all
  if (projects.length === 0) {
    return (
      <div className="empty-state" style={{ flex: 1, background: '#000', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '80%', maxWidth: 400 }}>
          <div
            onClick={onImportVideo}
            style={{
              padding: '20px 24px',
              background: 'rgba(212,168,83,0.08)',
              border: '1px solid rgba(212,168,83,0.2)',
              borderRadius: 12,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            <div>
              <div style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>导入视频</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>单个视频，自动生成笔记和闪卡</div>
            </div>
          </div>
          <div
            onClick={onCreateCollection}
            style={{
              padding: '20px 24px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="14" x2="22" y2="14"/></svg>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>创建合集</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>批量上传视频，如"资料分析"全套课程</div>
            </div>
          </div>
          <div
            onClick={onImportProject}
            style={{
              padding: '20px 24px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>导入项目</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>从导出的 zip 文件恢复学习进度</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 28px',
      overflowY: 'auto',
    }}>
      {/* Search + Actions row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{
          flex: 1,
          position: 'relative',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="搜索项目..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <button
          onClick={onImportVideo}
          style={{
            padding: '8px 14px',
            background: 'rgba(212,168,83,0.15)',
            border: '1px solid rgba(212,168,83,0.3)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + 导入视频
        </button>
        <button
          onClick={onCreateCollection}
          style={{
            padding: '8px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          + 创建合集
        </button>
        <button
          onClick={onImportProject}
          style={{
            padding: '8px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          导入项目
        </button>
        <button
          onClick={onOnlineCourse}
          style={{
            padding: '8px 14px',
            background: 'rgba(100,149,237,0.12)',
            border: '1px solid rgba(100,149,237,0.3)',
            borderRadius: 8,
            color: '#6495ED',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          在线课程
        </button>
      </div>

      {/* Project list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
            {search ? '没有匹配的项目' : '暂无项目'}
          </div>
        )}
        {filtered.map((p) => {
          const pct = Math.round((p.progressPct || 0) * 100);
          const isCollection = p.type === 'multi' || (p.videos && p.videos.length > 0);
          const videoCount = p.videos?.length || 0;

          return (
            <div
              key={p.id}
              onClick={() => onSelectProject(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                gap: '14px',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'rgba(255,255,255,0.05)';
                el.style.borderColor = 'rgba(212,168,83,0.25)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'rgba(255,255,255,0.02)';
                el.style.borderColor = 'rgba(255,255,255,0.05)';
              }}
            >
              {/* Icon */}
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: isCollection ? 'rgba(212,168,83,0.12)' : 'rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {isCollection ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="2" y1="14" x2="22" y2="14"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {p.name}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: isCollection ? 'rgba(212,168,83,0.1)' : 'rgba(255,255,255,0.05)',
                    color: isCollection ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 10,
                  }}>
                    {isCollection ? `合集 · ${videoCount}个视频` : '单视频'}
                  </span>
                  {p.hasNotes && (
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>笔记</span>
                  )}
                  {p.hasFlashcards && (
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>闪卡</span>
                  )}
                  <span>{relativeTime(p.lastWatchedAt || p.createdAt || 0)}</span>
                </div>
                {/* Progress bar */}
                <div style={{
                  marginTop: '6px',
                  height: '2px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '1px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: pct > 0 ? 'var(--accent)' : 'transparent',
                    borderRadius: '1px',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>

              {/* Right side: progress % + open folder + delete */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11,
                  color: pct > 0 ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: 500,
                  minWidth: 32,
                  textAlign: 'right',
                }}>
                  {pct > 0 ? `${pct}%` : '未开始'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI?.openProjectFolder(p.folderPath);
                  }}
                  title="打开目录"
                  style={{
                    width: 24,
                    height: 24,
                    border: 'none',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.15)',
                    cursor: 'pointer',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--accent)';
                    (e.currentTarget as HTMLElement).style.background = 'rgba(212,168,83,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.15)';
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                </button>
                {!p.hasNotes && onStartAnalysis && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartAnalysis(p.folderPath);
                    }}
                    title="继续分析"
                    style={{
                      padding: '2px 10px',
                      background: 'rgba(212,168,83,0.12)',
                      border: '1px solid rgba(212,168,83,0.25)',
                      borderRadius: 4,
                      color: 'var(--accent)',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    继续分析
                  </button>
                )}
                {onDeleteProject && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`确定删除 "${p.name}" 吗？此操作不可恢复。`)) {
                        const result = await window.electronAPI?.deleteProject(p.folderPath);
                        if (result?.error) {
                          alert(`删除失败: ${result.error}`);
                        } else {
                          setProjects((prev) => prev.filter((x) => x.id !== p.id));
                          onDeleteProject(p.id);
                        }
                      }
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      border: 'none',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.15)',
                      cursor: 'pointer',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      padding: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = '#ff6b6b';
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,107,107,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.15)';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
