'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SoundItem, getAllSounds, saveSound, deleteSound } from '../utils/indexedDb';
import {
  playSound,
  stopSound,
  stopAllSounds,
  decodeAndCacheSound,
  removeSoundFromCache,
  getSoundDuration
} from '../utils/audioEngine';
import styles from './Soundboard.module.css';

// 3 Static Pads Configuration
const PADS_CONFIG = [
  { id: 'pad_1', key: '1', color: '#ff3333', label: '1' }, // Vibrant Blood Red
  { id: 'pad_2', key: '2', color: '#cc0000', label: '2' }, // Medium Blood Red
  { id: 'pad_3', key: '3', color: '#990000', label: '3' }, // Deep Blood Red
];

function hexToRgb(hex: string): string {
  const cleanHex = hex.replace('#', '');
  let fullHex = cleanHex;
  if (cleanHex.length === 3) {
    fullHex = cleanHex.split('').map(char => char + char).join('');
  }
  const num = parseInt(fullHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return isNaN(r) || isNaN(g) || isNaN(b) ? '139, 92, 246' : `${r}, ${g}, ${b}`;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}.${ms}`;
}

export default function Soundboard() {
  // Store the 3 pads in a mapped object for direct access
  const [pads, setPads] = useState<{ [id: string]: SoundItem | null }>({
    pad_1: null,
    pad_2: null,
    pad_3: null,
  });
  
  const [playingPads, setPlayingPads] = useState<{ [id: string]: boolean }>({});
  const [playbackProgress, setPlaybackProgress] = useState<{ [id: string]: { elapsed: number; duration: number } }>({});
  const startTimestamps = useRef<{ [id: string]: number }>({});
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  
  // File input refs
  const fileRefs = {
    pad_1: useRef<HTMLInputElement>(null),
    pad_2: useRef<HTMLInputElement>(null),
    pad_3: useRef<HTMLInputElement>(null),
  };

  const showToast = (message: string, type: string = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load pads on startup
  useEffect(() => {
    async function loadPads() {
      try {
        const data = await getAllSounds();
        const loadedPads = { pad_1: null, pad_2: null, pad_3: null } as { [id: string]: SoundItem | null };
        
        data.forEach((sound) => {
          if (sound.id === 'pad_1' || sound.id === 'pad_2' || sound.id === 'pad_3') {
            loadedPads[sound.id] = sound;
            // Pre-decode for zero latency
            decodeAndCacheSound(sound.id, sound.audioBlob).catch((err) =>
              console.error(`Error pre-decoding ${sound.id}:`, err)
            );
          }
        });
        
        setPads(loadedPads);
      } catch (err) {
        console.error(err);
        showToast('Failed to load local sound pads', 'error');
      }
    }
    loadPads();
  }, []);

  // Track playback time elapsed and duration progress (timelapse)
  useEffect(() => {
    const activeIds = Object.keys(playingPads).filter((id) => playingPads[id]);
    if (activeIds.length === 0) {
      return;
    }

    let animFrameId: number;

    const updateProgress = () => {
      const updatedProgress = {} as { [id: string]: { elapsed: number; duration: number } };
      
      activeIds.forEach((id) => {
        const sound = pads[id];
        if (!sound) return;

        const duration = getSoundDuration(id);
        if (duration <= 0) return;

        const startTime = startTimestamps.current[id];
        if (!startTime) return;

        let elapsed = (Date.now() - startTime) / 1000;
        if (sound.loop) {
          elapsed = elapsed % duration;
        } else {
          elapsed = Math.min(elapsed, duration);
        }

        updatedProgress[id] = { elapsed, duration };
      });

      setPlaybackProgress(updatedProgress);
      animFrameId = requestAnimationFrame(updateProgress);
    };

    animFrameId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animFrameId);
  }, [playingPads, pads]);

  // Global Keyboard listener for keybind triggers (1, 2, 3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focused in form controls
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')
      ) {
        return;
      }

      const pressedKey = e.key;
      const matchedConfig = PADS_CONFIG.find(config => config.key === pressedKey);

      if (matchedConfig) {
        const sound = pads[matchedConfig.id];
        if (sound) {
          e.preventDefault();
          if (playingPads[sound.id]) {
            handleStopPad(sound.id);
          } else {
            handlePlayPad(sound);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pads, playingPads]);

  // Play Sound Pad
  const handlePlayPad = async (sound: SoundItem) => {
    try {
      // Monophonic: stop any other playing sound first
      stopAllSounds();
      setPlayingPads({});
      
      // Clear previous progress
      setPlaybackProgress({});

      // Record start timestamp
      startTimestamps.current = { [sound.id]: Date.now() };
      setPlayingPads((prev) => ({ ...prev, [sound.id]: true }));
      
      await playSound(
        sound.id,
        sound.audioBlob,
        sound.volume,
        sound.loop,
        undefined,
        () => {
          setPlayingPads((prev) => ({ ...prev, [sound.id]: false }));
          // Clear progress for this sound on completion
          setPlaybackProgress((prev) => {
            const updated = { ...prev };
            delete updated[sound.id];
            return updated;
          });
        }
      );
    } catch (err) {
      console.error(err);
      showToast('Playback error', 'error');
      setPlayingPads((prev) => ({ ...prev, [sound.id]: false }));
    }
  };

  // Stop Sound Pad
  const handleStopPad = (id: string) => {
    stopSound(id);
    setPlayingPads((prev) => ({ ...prev, [id]: false }));
    setPlaybackProgress((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  // Handle direct file upload onto a pad card
  const handleUploadFile = async (id: string, file: File, config: typeof PADS_CONFIG[0]) => {
    if (!file.type.startsWith('audio/')) {
      showToast('Please select a valid audio file!', 'error');
      return;
    }

    const soundName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    
    const newSound: SoundItem = {
      id,
      name: soundName,
      audioBlob: file,
      keybind: config.key,
      volume: 0.8, // 80% default volume
      loop: false,
      color: config.color,
      createdAt: Date.now(),
    };

    try {
      await saveSound(newSound);
      await decodeAndCacheSound(id, file);
      
      setPads((prev) => ({ ...prev, [id]: newSound }));
      showToast(`Uploaded "${soundName}" onto Pad ${config.key}`);
    } catch (err) {
      console.error(err);
      showToast('Error uploading sound file', 'error');
    }
  };

  // Delete sound pad file
  const handleDeletePad = async (id: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to clear Pad ${key}?`)) return;

    try {
      await deleteSound(id);
      removeSoundFromCache(id);
      
      setPads((prev) => ({ ...prev, [id]: null }));
      setPlayingPads((prev) => ({ ...prev, [id]: false }));
      showToast(`Pad ${key} cleared`);
    } catch (err) {
      console.error(err);
      showToast('Failed to clear pad', 'error');
    }
  };

  // Card volume control slider adjustments
  const handleVolumeChange = async (id: string, val: number, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const pad = pads[id];
    if (!pad) return;

    const updatedPad = { ...pad, volume: val };
    try {
      await saveSound(updatedPad);
      setPads((prev) => ({ ...prev, [id]: updatedPad }));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.dashboard}>
      {/* Brand Header */}
      <header className={styles.brand}>
        <div className={styles.logoArea}>
          <svg className={styles.logoIcon} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5v14M22 8v8M7 8v8M2 10v4"></path>
          </svg>
          <h1 className={styles.logoText}>SonicPad</h1>
        </div>
        <p className={styles.subtitle}>Ultra-Simple Call Soundboard</p>
      </header>

      {/* Grid containing exactly 3 Pads */}
      <div className={styles.soundGrid}>
        {PADS_CONFIG.map((config) => {
          const sound = pads[config.id];
          const isPlaying = !!playingPads[config.id];
          const rgbColor = hexToRgb(config.color);
          const fileInputRef = fileRefs[config.id as keyof typeof fileRefs];

          return (
            <div
              key={config.id}
              className={`${styles.padCard} ${isPlaying ? styles.padCardActive : ''}`}
              style={{ '--color-rgb': rgbColor } as React.CSSProperties}
              onClick={() => sound && (isPlaying ? handleStopPad(sound.id) : handlePlayPad(sound))}
            >
              {/* Box Number Key Badge */}
              <span className={styles.keyBadge}>{config.label}</span>

              {sound ? (
                <>
                  {/* Clear Button */}
                  <button
                    className={styles.trashBtn}
                    title={`Clear Pad ${config.key}`}
                    onClick={(e) => handleDeletePad(sound.id, config.key, e)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>

                  {/* Play Visualizer Circle */}
                  <div className={`${styles.playIconWrapper} ${isPlaying ? styles.playIconWrapperActive : ''}`}>
                    {isPlaying && (
                      <>
                        <div className={styles.pulseRing} style={{ animationDelay: '0s' }} />
                        <div className={styles.pulseRing} style={{ animationDelay: '0.4s' }} />
                      </>
                    )}
                    {isPlaying ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                      </svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                      </svg>
                    )}
                  </div>

                  {/* Sound Name Title */}
                  <h3 className={styles.soundName}>{sound.name}</h3>

                  {/* Playback Progress Timeline (Timelapse) */}
                  {isPlaying && playbackProgress[sound.id] ? (
                    <div className={styles.timelineDeck}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{
                            width: `${(playbackProgress[sound.id].elapsed / playbackProgress[sound.id].duration) * 100}%`,
                            backgroundColor: config.color,
                          }}
                        />
                      </div>
                      <span className={styles.timeLabel}>
                        {formatTime(playbackProgress[sound.id].elapsed)} / {formatTime(playbackProgress[sound.id].duration)}
                      </span>
                    </div>
                  ) : null}

                  {/* Volume Deck */}
                  <div className={styles.cardVolumeDeck} onClick={(e) => e.stopPropagation()}>
                    <svg className={styles.volumeIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    </svg>
                    <input
                      type="range"
                      className={styles.volumeSlider}
                      min="0"
                      max="1"
                      step="0.05"
                      value={sound.volume}
                      onChange={(e) => handleVolumeChange(sound.id, parseFloat(e.target.value), e)}
                    />
                    <span className={styles.volumeVal}>{Math.round(sound.volume * 100)}%</span>
                  </div>
                </>
              ) : (
                /* Empty Upload Target */
                <div
                  className={styles.uploader}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleUploadFile(config.id, e.dataTransfer.files[0], config);
                    }
                  }}
                >
                  <svg className={styles.uploadIcon} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span className={styles.uploadText}>Drop audio file or click to browse</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className={styles.fileInput}
                    accept="audio/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUploadFile(config.id, e.target.files[0], config);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mic Routing Notice Footer */}
      <footer className={styles.footerNotice}>
        <svg className={styles.noticeIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div className={styles.noticeText}>
          <strong>🎙️ Voicemeeter Banana Setup for Calls:</strong>
          <ol style={{ paddingLeft: '18px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Set this browser tab output (or system mixer output) to <strong>CABLE Input (VB-Audio)</strong>.</li>
            <li>In Voicemeeter Banana, select <strong>CABLE Output</strong> as <strong>Hardware Input 2</strong> (or 3).</li>
            <li>On that <strong>CABLE channel strip</strong>: Turn <strong>ON</strong> both <strong>A1</strong> (so you can hear the sounds yourself) and <strong>B1</strong> (so the call can hear them).</li>
            <li>On your <strong>Microphone strip (Hardware Input 1)</strong>: Turn <strong>ON</strong> only <strong>B1</strong> (sends your voice to the call) and turn <strong>OFF</strong> A1 (so you don't hear your own voice echo).</li>
            <li>In Discord, Zoom, or WhatsApp, set your <strong>Input Device (Microphone)</strong> to <strong>VoiceMeeter Output (VAIO)</strong>.</li>
          </ol>
        </div>
      </footer>

      {/* Glassmorphic self-dismissing Toast notification */}
      {toast && (
        <div className={styles.toast}>
          {toast.type === 'error' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
