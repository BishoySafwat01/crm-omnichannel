import React, { useState, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

export interface AudioPlayerWidgetProps {
  url: string;
}

export const AudioPlayerWidget: React.FC<AudioPlayerWidgetProps> = ({ url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.volume = 1.0;
      audioRef.current.muted = false;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Audio playback error:', err);
          setIsPlaying(false);
        });
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    let dur = audioRef.current.duration;
    if (dur === Infinity || isNaN(dur)) {
      dur = duration > 0 ? duration : current;
    }
    setCurrentTime(current);
    if (dur > 0 && isFinite(dur)) {
      setProgress((current / dur) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      if (dur === Infinity || isNaN(dur)) {
        // Chromium WebM fix for Infinity duration
        audioRef.current.currentTime = 1e101;
        audioRef.current.ontimeupdate = function () {
          this.ontimeupdate = () => handleTimeUpdate();
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setDuration(audioRef.current.duration || 0);
          }
        };
      } else {
        setDuration(dur);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const totalDur =
      audioRef.current.duration && isFinite(audioRef.current.duration)
        ? audioRef.current.duration
        : duration;
    if (totalDur > 0 && isFinite(totalDur)) {
      const newTime = (clickX / width) * totalDur;
      audioRef.current.currentTime = newTime;
      setProgress((newTime / totalDur) * 100);
    }
  };

  const formatAudioTime = (sec: number) => {
    if (isNaN(sec) || !isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-slate-100/90 hover:bg-slate-100 p-2.5 rounded-2xl border border-slate-200/80 my-1 min-w-[220px]">
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => {
          if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition shrink-0 shadow-2xs cursor-pointer"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div
          onClick={handleSeek}
          className="h-2 bg-slate-200 rounded-full overflow-hidden cursor-pointer relative"
        >
          <div
            className="h-full bg-emerald-600 transition-all duration-75"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium font-mono">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{duration > 0 ? formatAudioTime(duration) : 'تسجيل صوتي'}</span>
        </div>
      </div>
    </div>
  );
};

export const CustomAudioPlayer = AudioPlayerWidget;
