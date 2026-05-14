import { create } from 'zustand';

export interface DarkChessSettings {
  rookCaptureRange: 'adjacent' | 'fullLine';
  cannonCaptureRule: 'needJump' | 'direct';
  soldierKillGeneral: boolean;
}

export interface UISettings {
  largeFont: boolean;
  soundEnabled: boolean;
  flipRevealCueEnabled: boolean;
}

interface SettingsStore {
  darkChess: DarkChessSettings;
  ui: UISettings;
  setDarkChessSetting: <K extends keyof DarkChessSettings>(key: K, value: DarkChessSettings[K]) => void;
  setUISetting: <K extends keyof UISettings>(key: K, value: UISettings[K]) => void;
  resetToDefaults: () => void;
}

const DEFAULT_DARK_CHESS: DarkChessSettings = {
  rookCaptureRange: 'adjacent',
  cannonCaptureRule: 'needJump',
  soldierKillGeneral: true,
};

const DEFAULT_UI: UISettings = {
  largeFont: false,
  soundEnabled: true,
  flipRevealCueEnabled: true,
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  darkChess: { ...DEFAULT_DARK_CHESS },
  ui: { ...DEFAULT_UI },

  setDarkChessSetting: (key, value) => {
    set((state) => ({
      darkChess: { ...state.darkChess, [key]: value },
    }));
  },

  setUISetting: (key, value) => {
    set((state) => ({
      ui: { ...state.ui, [key]: value },
    }));
  },

  resetToDefaults: () => {
    set({
      darkChess: { ...DEFAULT_DARK_CHESS },
      ui: { ...DEFAULT_UI },
    });
  },
}));
