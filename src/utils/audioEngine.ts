let globalAudioContext: AudioContext | null = null;
const audioBufferCache = new Map<string, AudioBuffer>();
const activeSources = new Map<string, { source: AudioBufferSourceNode; gainNode: GainNode }[]>();
let masterVolumeNode: GainNode | null = null;
let currentMasterVolume = 0.8; // default master volume 80%

export function getAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('AudioContext is only available in the browser.');
  }
  
  if (!globalAudioContext) {
    // Standard AudioContext or WebkitAudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    globalAudioContext = new AudioContextClass();
    
    // Create master gain node
    masterVolumeNode = globalAudioContext.createGain();
    masterVolumeNode.gain.value = currentMasterVolume;
    masterVolumeNode.connect(globalAudioContext.destination);
  }
  
  // Resume if suspended (browser security)
  if (globalAudioContext.state === 'suspended') {
    globalAudioContext.resume();
  }
  
  return globalAudioContext;
}

export function setMasterVolume(volume: number) {
  currentMasterVolume = Math.max(0, Math.min(1, volume));
  if (masterVolumeNode) {
    masterVolumeNode.gain.setValueAtTime(currentMasterVolume, getAudioContext().currentTime);
  }
}

export function getMasterVolume(): number {
  return currentMasterVolume;
}

/**
 * Decodes a file Blob and caches the decoded AudioBuffer for instant playback later.
 */
export async function decodeAndCacheSound(id: string, blob: Blob): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(
      arrayBuffer,
      (audioBuffer) => {
        audioBufferCache.set(id, audioBuffer);
        resolve(audioBuffer);
      },
      (error) => {
        reject(new Error(`Failed to decode audio data for sound ${id}: ${error}`));
      }
    );
  });
}

/**
 * Removes a sound from the decoded audio cache.
 */
export function removeSoundFromCache(id: string) {
  audioBufferCache.delete(id);
  stopSound(id);
}

/**
 * Plays a sound by its ID. Decodes on-the-fly if not cached, but caching beforehand is highly recommended.
 */
export async function playSound(
  id: string,
  blob: Blob,
  volume: number = 1.0,
  loop: boolean = false,
  onPlayStart?: () => void,
  onPlayEnd?: () => void
): Promise<void> {
  const ctx = getAudioContext();
  
  let audioBuffer = audioBufferCache.get(id);
  if (!audioBuffer) {
    // Decode on the fly if not cached
    audioBuffer = await decodeAndCacheSound(id, blob);
  }
  
  // Create source and gain nodes
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = loop;
  
  const gainNode = ctx.createGain();
  // Set individual sound volume
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  
  // Connect source -> individual gain -> master volume node -> output
  source.connect(gainNode);
  if (masterVolumeNode) {
    gainNode.connect(masterVolumeNode);
  } else {
    gainNode.connect(ctx.destination);
  }
  
  // Add to active playing sources
  const currentActive = activeSources.get(id) || [];
  currentActive.push({ source, gainNode });
  activeSources.set(id, currentActive);
  
  // Event handlers
  source.onended = () => {
    // Remove this source from active sources
    const list = activeSources.get(id) || [];
    const index = list.findIndex((item) => item.source === source);
    if (index !== -1) {
      list.splice(index, 1);
      if (list.length === 0) {
        activeSources.delete(id);
      } else {
        activeSources.set(id, list);
      }
    }
    
    if (onPlayEnd) {
      onPlayEnd();
    }
  };
  
  // Trigger start
  source.start(0);
  if (onPlayStart) {
    onPlayStart();
  }
}

/**
 * Stops all playing instances of a specific sound.
 */
export function stopSound(id: string) {
  const list = activeSources.get(id);
  if (list) {
    list.forEach((item) => {
      try {
        item.source.stop();
      } catch (e) {
        // Source might have already stopped
      }
    });
    activeSources.delete(id);
  }
}

/**
 * Stop-all Panic Button: Stops every playing sound immediately.
 */
export function stopAllSounds() {
  activeSources.forEach((list) => {
    list.forEach((item) => {
      try {
        item.source.stop();
      } catch (e) {
        // Ignore errors for already stopped sounds
      }
    });
  });
  activeSources.clear();
}

/**
 * Returns the duration of a cached sound buffer in seconds.
 */
export function getSoundDuration(id: string): number {
  const buffer = audioBufferCache.get(id);
  return buffer ? buffer.duration : 0;
}
