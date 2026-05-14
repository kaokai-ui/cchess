import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface DarkChessSettings {
  rookCaptureRange: 'adjacent' | 'fullLine';
  cannonCaptureRule: 'needJump' | 'direct';
  soldierKillGeneral: boolean;
}

export type AITurnPace = 'standard' | 'elder';

export interface UISettings {
  largeFont: boolean;
  soundEnabled: boolean;
  flipRevealCueEnabled: boolean;
  darkAiFlipPace: AITurnPace;
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
  darkAiFlipPace: 'standard',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'cchess-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
