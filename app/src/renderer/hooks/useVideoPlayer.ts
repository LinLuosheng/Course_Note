import { useCallback, useEffect, useRef, useState } from 'react';

export interface VideoPlayerState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
}

export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<VideoPlayerState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    volume: 1,
  });

  // Re-bind events whenever the video element changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () =>
      setState((s) => ({ ...s, currentTime: video.currentTime }));
    const onDurationChange = () =>
      setState((s) => ({ ...s, duration: video.duration || 0 }));
    const onPlay = () => setState((s) => ({ ...s, isPlaying: true }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    // Sync initial state
    setState((s) => ({
      ...s,
      currentTime: video.currentTime,
      duration: video.duration || 0,
      isPlaying: !video.paused,
    }));

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [videoRef.current]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video && isFinite(seconds) && seconds >= 0) {
      video.currentTime = seconds;
    }
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  }, []);

  return { videoRef, ...state, seekTo, togglePlay };
}
