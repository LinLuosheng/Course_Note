import { useState, useEffect, useMemo } from 'react';
import { useProgressStore } from '../store/progress-store';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes > 0 ? ` ${minutes}分` : ''}`;
  return `${minutes}分钟`;
}

function heatColor(minutes: number): string {
  if (minutes === 0) return 'rgba(255,255,255,0.04)';
  if (minutes < 5) return 'rgba(212, 168, 83, 0.12)';
  if (minutes < 15) return 'rgba(212, 168, 83, 0.25)';
  if (minutes < 30) return 'rgba(212, 168, 83, 0.45)';
  if (minutes < 60) return 'rgba(212, 168, 83, 0.65)';
  return 'var(--accent)';
}

function dayLabel(dayIndex: number): string {
  const labels = ['日', '一', '二', '三', '四', '五', '六'];
  return labels[dayIndex];
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function StudyDashboard() {
  const { sessions, stats, loadSessions } = useProgressStore();
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSessions();
  }, []);

  // Load project names for recent activity
  useEffect(() => {
    window.electronAPI?.listProjects().then((list) => {
      if (!list) return;
      const map: Record<string, string> = {};
      (list as any[]).forEach((p: any) => { map[p.id] = p.name; });
      setProjectNames(map);
    });
  }, []);

  // Aggregate sessions by day for heatmap (last 12 weeks = 84 days)
  const heatmapData = useMemo(() => {
    const days: { date: string; minutes: number }[] = [];
    const now = new Date();
    for (let i = 83; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ date: key, minutes: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.date, d]));
    sessions.forEach((s) => {
      const key = dateKey(s.startedAt);
      const entry = dayMap.get(key);
      if (entry) entry.minutes += Math.round(s.durationSeconds / 60);
    });
    return days;
  }, [sessions]);

  // Today's study minutes
  const todayMinutes = useMemo(() => {
    const todayKey = dateKey(Date.now());
    return heatmapData.find((d) => d.date === todayKey)?.minutes || 0;
  }, [heatmapData]);

  const dailyGoalMinutes = 30;
  const goalPct = Math.min(1, todayMinutes / dailyGoalMinutes);

  // Completed courses count
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  useEffect(() => {
    window.electronAPI?.listProjects().then((list) => {
      if (!list) return;
      const l = list as any[];
      setTotalCount(l.length);
      setCompletedCount(l.filter((p) => p.hasNotes).length);
    });
  }, []);

  const recentSessions = useMemo(() => {
    return [...sessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, 5);
  }, [sessions]);

  return (
    <div style={{
      flex: 1,
      padding: '20px',
      overflowY: 'auto',
      color: 'var(--text-primary)',
      fontSize: '13px',
    }}>
      {/* Stats Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="总学习时长" value={formatDuration(stats.totalStudySeconds)} />
        <StatCard label="课程总数" value={`${totalCount} 门`} />
        <StatCard label="已完成" value={`${completedCount} 门`} />
        <StatCard label="连续学习" value={`${stats.streakDays} 天`} />
      </div>

      {/* Daily Goal + Heatmap Row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
        {/* Daily Goal Ring */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '140px',
        }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle
              cx="40" cy="40" r="34" fill="none"
              stroke="var(--accent)" strokeWidth="6"
              strokeDasharray={`${goalPct * 213.6} ${213.6 - goalPct * 213.6}`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
            <text x="40" y="37" textAnchor="middle" fill="var(--text-primary)" fontSize="16" fontWeight="700">
              {todayMinutes}
            </text>
            <text x="40" y="50" textAnchor="middle" fill="var(--text-muted)" fontSize="10">
              / {dailyGoalMinutes} 分
            </text>
          </svg>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>今日目标</div>
        </div>

        {/* Heatmap */}
        <div style={{
          flex: 1,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            学习热力图（近12周）
          </div>
          <svg width="100%" viewBox="0 0 460 84" style={{ display: 'block' }}>
            {/* Day labels */}
            {[1, 3, 5].map((d) => (
              <text key={d} x="0" y={12 + d * 12} fill="var(--text-muted)" fontSize="8" fontFamily="DM Sans, sans-serif">
                {dayLabel(d)}
              </text>
            ))}
            {/* Cells */}
            {heatmapData.map((day, i) => {
              const week = Math.floor(i / 7);
              const dayOfWeek = i % 7;
              return (
                <rect
                  key={day.date}
                  x={14 + week * 12}
                  y={dayOfWeek * 12}
                  width={10}
                  height={10}
                  rx={2}
                  fill={heatColor(day.minutes)}
                >
                  <title>{day.date}: {day.minutes}分钟</title>
                </rect>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: '12px',
        padding: '16px',
      }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          近期学习
        </div>
        {recentSessions.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            暂无学习记录，开始学习吧！
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentSessions.map((s) => {
              const name = projectNames[s.projectId] || s.projectId.slice(0, 8);
              return (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.02)',
                  gap: '12px',
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--accent)', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px', fontWeight: 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {new Date(s.startedAt).toLocaleDateString('zh-CN')} {new Date(s.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--accent)', flexShrink: 0 }}>
                    {formatDuration(s.durationSeconds)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: '12px',
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
