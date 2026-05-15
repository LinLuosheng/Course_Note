import { forwardRef, useImperativeHandle, useState, useEffect, useRef, useCallback } from 'react';
import { useProgressStore } from '../store/progress-store';

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void;
  getState: () => { currentTime: number; duration: number; isPlaying: boolean; volume: number };
}

interface VideoPlayerProps {
  videoPath: string | null;
  projectDir: string | null;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ videoPath, projectDir }, ref) {
    const [src, setSrc] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [resuming, setResuming] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const seekBarRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastSavedRef = useRef(0);

    const { playback, updatePlayback, savePlayback } = useProgressStore();

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const v = videoRef.current;
        if (v && isFinite(seconds) && seconds >= 0) v.currentTime = seconds;
      },
      getState: () => ({ currentTime, duration, isPlaying, volume: 1 }),
    }));

    // Load video source
    useEffect(() => {
      if (!videoPath) { setSrc(''); return; }
      window.electronAPI?.getMediaUrl(videoPath).then((url: string) => setSrc(url));
    }, [videoPath]);

    // Auto-save playback position every 5 seconds while playing
    useEffect(() => {
      if (saveTimerRef.current) {
        clearInterval(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (!projectDir || !isPlaying) return;

      saveTimerRef.current = setInterval(() => {
        const v = videoRef.current;
        if (!v || !projectDir) return;
        const now = Date.now();
        // Debounce: only save if >3s since last save
        if (now - lastSavedRef.current < 3000) return;
        lastSavedRef.current = now;

        const t = v.currentTime;
        const d = v.duration || 0;
        updatePlayback({
          timeOffset: t,
          duration: d,
          timeWatched: (playback?.timeWatched || 0) + 5,
          completed: d > 0 && t / d > 0.95,
        });
        savePlayback(projectDir);
      }, 5000);

      return () => {
        if (saveTimerRef.current) {
          clearInterval(saveTimerRef.current);
          saveTimerRef.current = null;
        }
      };
    }, [projectDir, isPlaying, playback?.timeWatched]);

    // Resume position + bind events via callback ref
    const bindVideoRef = useCallback((node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (!node) return;

      const onTimeUpdate = () => setCurrentTime(node.currentTime);
      const onDurationChange = () => {
        const d = node.duration || 0;
        setDuration(d);
        updatePlayback({ duration: d });
      };
      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);

      node.addEventListener('timeupdate', onTimeUpdate);
      node.addEventListener('durationchange', onDurationChange);
      node.addEventListener('play', onPlay);
      node.addEventListener('pause', onPause);

      // Resume from saved position
      if (playback && playback.timeOffset > 0 && playback.duration > 0) {
        const offset = playback.timeOffset;
        if (offset < playback.duration - 5) {
          node.currentTime = offset;
          setResuming(true);
          setTimeout(() => setResuming(false), 2500);
        }
      }

      (node as any)._cleanup = () => {
        node.removeEventListener('timeupdate', onTimeUpdate);
        node.removeEventListener('durationchange', onDurationChange);
        node.removeEventListener('play', onPlay);
        node.removeEventListener('pause', onPause);
      };
    }, [playback?.timeOffset]);

    // Final save on unmount
    useEffect(() => {
      return () => {
        const v = videoRef.current;
        if (v && projectDir) {
          const t = v.currentTime;
          const d = v.duration || 0;
          updatePlayback({
            timeOffset: t,
            duration: d,
            completed: d > 0 && t / d > 0.95,
          });
          savePlayback(projectDir);
        }
        if (v && (v as any)._cleanup) (v as any)._cleanup();
      };
    }, [projectDir]);

    const togglePlay = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      v.paused ? v.play() : v.pause();
    }, []);

    const seekToPct = useCallback((pct: number) => {
      const v = videoRef.current;
      if (v && v.duration) v.currentTime = pct * v.duration;
    }, []);

    const handleSeekBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (!seekBarRef.current) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekToPct(pct);
    }, [seekToPct]);

    // Drag support
    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current || !seekBarRef.current) return;
        const rect = seekBarRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seekToPct(pct);
      };
      const onMouseUp = () => { dragging.current = false; };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }, [seekToPct]);

    const formatTime = (s: number) => {
      const mm = Math.floor(s / 60);
      const ss = Math.floor(s % 60);
      return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    };

    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

    if (!videoPath) {
      return (
        <div className="empty-state" style={{ flex: 1, background: '#000' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>点击「导入视频」开始</p>
        </div>
      );
    }

    return (
      <div className="video-container">
        {src && (
          <video
            ref={bindVideoRef}
            src={src}
            style={{ flex: 1, objectFit: 'contain' }}
            onClick={togglePlay}
          />
        )}
        {resuming && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)',
            color: 'var(--accent)',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 600,
            pointerEvents: 'none',
            animation: 'fadeOutUp 2.5s ease forwards',
            zIndex: 10,
          }}>
            从 {formatTime(playback?.timeOffset || 0)} 继续
          </div>
        )}
        <div className="video-controls">
          <button className="play-btn" onClick={togglePlay}>
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            )}
          </button>
          <span className="video-time">{formatTime(currentTime)}</span>
          <div
            className="video-seek-bar"
            ref={seekBarRef}
            onClick={handleSeekBarClick}
            onMouseDown={(e) => { dragging.current = true; handleSeekBarClick(e); }}
          >
            <div className="video-seek-fill" style={{ width: `${progressPct}%` }} />
            <div className="video-seek-thumb" style={{ left: `${progressPct}%` }} />
          </div>
          <span className="video-time" style={{ opacity: 0.5 }}>{formatTime(duration)}</span>
        </div>
      </div>
    );
  }
);
