# AGENTS.md — CChess

## Project Status

Greenfield project. No code yet. Planning docs only.

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript
- **State**: Zustand
- **Styling**: TailwindCSS (responsive)
- **Multiplayer**: Firebase (Realtime Database / Firestore) + App Check
- **Packaging**: Capacitor → APK for Android Pad / Android TV

## Project Structure (planned)

```
client/       # Vite + React frontend
server/       # NOT used — Firebase replaces self-hosted server
shared/       # Types and game logic shared between client and Firebase functions
android/      # Capacitor Android project
```

## Critical Constraints

- **Multiplayer requires**: Firebase, room codes, App Check
- **Single-player requires**: NO Firebase, NO room codes, NO App Check — all local
- **Never** import Firebase SDK into single-player-only code paths
- **Target devices**: PC, iPad 10.6", 10" Android Pad, 14" Android Pad, 65" Android TV (4K)
- **Android TV**: must support D-Pad remote control navigation
- **Elder-friendly mode**: large fonts (20-28px), large buttons (48-80px), high contrast, slower animations

## Game Modes

| Mode | Single-player | Multiplayer |
|------|:---:|:---:|
| 明棋 (Bright chess) | ✓ (AI) | ✓ (Firebase) |
| 暗棋 (Dark chess) | ✓ (AI) | ✓ (Firebase) |

- AI difficulties: `easy` | `normal` | `hard` | `master` (棋聖)
- Solo AI default difficulty: `hard` for both Bright chess and Dark chess
- Dark chess solo AI may resign in late endgames when no unrevealed pieces remain and it has no realistic winning line
- Dark chess has configurable rules (e.g., rook capture range, cannon capture rule)

## Commands (once initialized)

### RTK / PowerShell Rule

- On this machine, `rtk` only proxies external programs.
- `rtk` does **not** execute PowerShell cmdlets directly, so commands like `rtk Get-Content ...` will fail.
- When a command needs a PowerShell cmdlet, use `rtk proxy powershell -NoProfile -Command "..."`.
- Example: `rtk proxy powershell -NoProfile -Command "Get-Content -Raw 'D:\\Game\\CChess\\AGENTS.md'"`

```bash
# Initialize project (run once)
npm create vite@latest client -- --template react-ts

# Dev
cd client && npm run dev

# Typecheck
cd client && npx tsc --noEmit

# Build
cd client && npm run build

# APK build (after Capacitor setup)
npx cap add android
npx cap sync
npx cap open android
```

## Planning Docs

- `local-admin/DEVELOPMENT_PLAN.md` — full spec, phases, UI details
- `local-admin/DEVELOPMENT_NOTES.md` — Firebase and connectivity decisions
