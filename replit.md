# Rhythm Game - 4 Lane Keyboard

## Overview

A browser-based rhythm game featuring 4-lane keyboard gameplay with precise timing mechanics. Players hit notes falling down lanes using keyboard controls (D/F/J/K by default), with a judgment system that evaluates timing accuracy (Perfect/Great/Good/Miss). The game includes comprehensive features like customizable settings, local best score tracking, and a detailed results screen with grade calculations.

The application uses a dual-architecture approach: a legacy vanilla JavaScript implementation in the `public/` directory (fully functional standalone game) and a modern React/TypeScript setup in `client/` (currently scaffolded but not implemented). The vanilla JS version serves as the primary gameplay implementation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Dual Implementation Pattern:**
- **Legacy Implementation (Active):** Vanilla JavaScript modules in `public/js/` with direct DOM manipulation and Canvas API rendering
- **Modern Implementation (Scaffolded):** React + TypeScript with Vite, shadcn/ui component library, TanStack Query - currently contains only boilerplate with no game logic implemented

**Legacy Game Architecture (public/):**
- **Modular ES6 Structure:** Six core modules handling distinct concerns:
  - `main.js` - Application orchestrator and event binding
  - `game.js` - Game loop, state machine, rendering, hit detection
  - `audio.js` - Web Audio API management with automatic beep tone fallback
  - `chart.js` - Song chart loading and validation
  - `input.js` - Keyboard handling and customizable key mapping
  - `ui.js` - Screen transitions, HUD updates, settings persistence

- **Game State Machine:** Transitions between MENU → PLAYING → PAUSED → RESULTS states
- **Canvas Rendering:** Fixed 800×600px game canvas with 4 equal-width lanes
- **Timing System:** 60 FPS game loop using `requestAnimationFrame` with precise timing windows (±35ms Perfect, ±70ms Great, ±110ms Good)

**Modern Stack (client/):**
- **React 18** with TypeScript and Vite bundler
- **Routing:** wouter for client-side navigation
- **UI Components:** shadcn/ui with Radix UI primitives and Tailwind CSS
- **State Management:** TanStack Query for server state (currently unused)
- **Styling:** Tailwind CSS with custom design tokens, high-contrast theme optimized for gameplay readability

**Design System Approach:**
- Hybrid game-optimized design inspired by OSU! and arcade rhythm games
- Typography: 'Press Start 2P' for retro game UI, 'Inter' for settings/menus
- High contrast color palette with distinct lane colors (cyan, magenta, yellow, green)
- Judgment colors: white (Perfect), green (Great), yellow (Good), red (Miss)

### Backend Architecture

**Express.js Server:**
- Minimal REST API serving static assets and the game HTML
- Single route configuration in `server/routes.ts`
- Serves legacy game from `public/` directory at root path
- Vite development middleware integration for React app development

**Storage Layer:**
- In-memory storage implementation (`MemStorage`) with user CRUD operations
- Designed for database abstraction (implements `IStorage` interface)
- Currently stores user data only; game scores/settings use browser localStorage

**Build Process:**
- Development: `tsx` for TypeScript execution, Vite dev server for hot reloading
- Production: Vite builds client SPA, esbuild bundles server to `dist/`
- Dual serving capability: legacy game from `public/`, React app from Vite

### Data Storage Solutions

**Browser localStorage (Primary for Game Data):**
- Settings: volume level, audio offset timing, custom key bindings
- Best Scores: per-song high scores with grade/accuracy
- No backend persistence - all game state is client-side

**Database Configuration (Unused):**
- Drizzle ORM configured for PostgreSQL via Neon serverless
- Schema defines users table with username/password authentication
- Database integration present but not utilized by current game implementation
- Migration system ready via `drizzle-kit push`

**Chart Data:**
- JSON files in `public/charts/` directory
- Static chart format: `{ title, audio, offsetMs, bpm, lanes, notes[] }`
- Notes specify timing (ms) and lane index (0-3)
- Loaded via fetch API at song selection

### External Dependencies

**Core Game Libraries:**
- **Web Audio API:** Native browser API for audio playback and synthesis
- **Canvas API:** Native 2D rendering for game graphics
- **localStorage API:** Native browser storage for settings/scores

**Frontend Libraries (Modern Stack):**
- **React 18** + **React DOM:** UI framework
- **wouter:** Lightweight client-side routing (≈1.2kB)
- **TanStack Query (React Query):** Server state management
- **Radix UI:** Headless accessible component primitives (30+ components installed)
- **shadcn/ui:** Pre-styled component collection built on Radix
- **Tailwind CSS:** Utility-first CSS framework
- **class-variance-authority:** Type-safe component variant management
- **react-hook-form:** Form state management with validation
- **zod:** Schema validation and TypeScript type inference

**Backend Libraries:**
- **Express.js:** Web server framework
- **Vite:** Build tool and dev server (with HMR middleware)
- **Drizzle ORM:** TypeScript ORM for PostgreSQL
- **@neondatabase/serverless:** Serverless Postgres driver
- **connect-pg-simple:** PostgreSQL session store (installed but unused)

**Development Tools:**
- **TypeScript:** Type safety across client and server
- **esbuild:** Fast JavaScript bundler for production builds
- **PostCSS + Autoprefixer:** CSS processing pipeline
- **Replit Plugins:** Runtime error modal, cartographer, dev banner (dev only)

**Audio Fallback:**
- If MP3 files are missing, `audio.js` automatically generates beep tones using Web Audio API's OscillatorNode
- No external audio library dependencies required