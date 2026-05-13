// Simple sound effects using Web Audio API (no external files needed)
import { useSettingsStore } from '../stores/settingsStore';

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const browserWindow = typeof window !== 'undefined' ? (window as AudioWindow) : null;
const AudioContextConstructor = browserWindow?.AudioContext || browserWindow?.webkitAudioContext;
const audioCtx = AudioContextConstructor ? new AudioContextConstructor() : null;

const playTone = (frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) => {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const state = useSettingsStore.getState();
  if (!state.ui.soundEnabled) return;
  
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
};

export const playMoveSound = () => {
  playTone(400, 0.1, 'sine', 0.2);
};

export const playCaptureSound = () => {
  playTone(200, 0.15, 'square', 0.3);
  setTimeout(() => playTone(150, 0.1, 'square', 0.2), 50);
};

export const playFlipSound = () => {
  playTone(600, 0.08, 'triangle', 0.15);
};

export const playCheckSound = () => {
  playTone(800, 0.1, 'sawtooth', 0.25);
  setTimeout(() => playTone(1000, 0.15, 'sawtooth', 0.2), 100);
};

export const playWinSound = () => {
  playTone(523, 0.15, 'sine', 0.3);
  setTimeout(() => playTone(659, 0.15, 'sine', 0.3), 150);
  setTimeout(() => playTone(784, 0.2, 'sine', 0.3), 300);
};

export const playLoseSound = () => {
  playTone(400, 0.2, 'sine', 0.3);
  setTimeout(() => playTone(300, 0.2, 'sine', 0.3), 200);
  setTimeout(() => playTone(200, 0.3, 'sine', 0.3), 400);
};
