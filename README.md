# 🎮 Rhythm Game - 4 Lane Keyboard

A browser-based rhythm game with 4-lane gameplay, keyboard controls, and precise timing mechanics.

## ✨ Features

- **4-Lane Gameplay**: Notes fall down 4 lanes toward a hit line
- **Keyboard Controls**: D / F / J / K keys (fully customizable)
- **Judgment System**: Perfect (±35ms), Great (±70ms), Good (±110ms), Miss
- **Scoring**: Track your score, combo, and accuracy in real-time
- **Audio System**: Supports MP3 files with Web Audio API, automatic beep tone fallback
- **Settings**: Adjustable volume, audio offset, and key remapping
- **Results**: Detailed statistics with grade (S/A/B/C) and judgment breakdown
- **LocalStorage**: Saves settings and best scores automatically

## 🚀 How to Run

1. Click the **Run** button in Replit
2. The game will open in a new browser tab
3. Select a song from the menu
4. Click **START GAME** and enjoy!

## 🎹 Controls

### Gameplay
- **D** - Lane 1 (leftmost)
- **F** - Lane 2
- **J** - Lane 3
- **K** - Lane 4 (rightmost)

### Game Controls
- **P** - Pause/Resume
- **R** - Restart current song
- **ESC** - Return to menu

## ⚙️ Settings

### Volume
Adjust the audio playback volume (0-100%)

### Audio Offset
Fine-tune audio synchronization (-100ms to +100ms in 5ms steps)
- **Positive values**: Delay the audio (if notes appear too early)
- **Negative values**: Advance the audio (if notes appear too late)

### Key Bindings
Customize which keys control each lane:
1. Click on a key button
2. Press the new key you want to use
3. Click **SAVE** to keep your changes

All settings are saved automatically to your browser's localStorage.

## 🎵 Creating Your Own Charts

Charts are stored as JSON files in `/public/charts/`. Here's the structure:

```json
{
  "title": "Your Song Name",
  "audio": "/audio/your-song.mp3",
  "offsetMs": 0,
  "bpm": 120,
  "lanes": 4,
  "notes": [
    { "timeMs": 1000, "lane": 0 },
    { "timeMs": 1250, "lane": 1 }
  ]
}
```

### Chart Properties

- **title**: Song name displayed in the game
- **audio**: Path to MP3 file (relative to public folder)
- **offsetMs**: Global timing offset for the chart
- **bpm**: Beats per minute (used for beep tone generation if no audio)
- **lanes**: Must be 4
- **notes**: Array of note objects

### Note Properties

- **timeMs**: When the note should be hit (in milliseconds from song start)
- **lane**: Which lane (0-3, left to right)

### Tips for Chart Creation

1. **Use a music editor** to identify beat times
2. **Start simple** with quarter notes, then add complexity
3. **Test frequently** - play your chart to check timing
4. **Notes are sorted** automatically by time, but keep them organized
5. **Use chord patterns** - multiple notes at the same timeMs for simultaneous hits

## 🎯 Judgment Windows

The game uses the following timing windows:

| Judgment | Window | Score | Color |
|----------|--------|-------|-------|
| Perfect | ±35ms | 1000 | White |
| Great | ±70ms | 700 | Green |
| Good | ±110ms | 300 | Yellow |
| Miss | >110ms | 0 | Red |

## 🎨 Customization

### Adjusting Approach Time

In `js/utils.js`, modify `APPROACH_TIME_MS`:
```javascript
export const APPROACH_TIME_MS = 1200; // Default: 1.2 seconds
```

### Adjusting Judgment Windows

In `js/utils.js`, modify `JUDGE_WINDOWS`:
```javascript
export const JUDGE_WINDOWS = {
  perfect: 35,  // Make larger for easier Perfect judgments
  great: 70,
  good: 110,
};
```

### Changing Lane Colors

In `public/style.css`, modify the CSS variables:
```css
:root {
  --lane-0: #00d4ff; /* Cyan */
  --lane-1: #ff00ff; /* Magenta */
  --lane-2: #ffcc00; /* Yellow */
  --lane-3: #00ff88; /* Green */
}
```

Also update the colors in `js/game.js`:
```javascript
const LANE_COLORS = [
  '#00d4ff',  // Cyan
  '#ff00ff',  // Magenta
  '#ffcc00',  // Yellow
  '#00ff88',  // Green
];
```

## 🔊 Audio Setup

### Using MP3 Files

1. Place your MP3 file in `/public/audio/`
2. Reference it in your chart JSON:
   ```json
   "audio": "/audio/your-song.mp3"
   ```

### Beep Tone Fallback

If no MP3 file is found, the game automatically generates beep tones based on the chart's BPM:
- Higher beep (880 Hz) on the first beat of each measure
- Lower beep (440 Hz) on other beats
- 4 measures total with 4/4 time signature

This ensures the game is playable immediately without requiring audio files!

## 📊 Grading System

Your performance is graded based on accuracy:

- **S Grade**: 95% accuracy or higher
- **A Grade**: 90% to 94.9% accuracy
- **B Grade**: 80% to 89.9% accuracy
- **C Grade**: Below 80% accuracy

## 🛠️ Technical Details

### Project Structure
```
/public
  /audio/          - MP3 audio files
  /charts/         - Chart JSON files
  /js/
    main.js        - Entry point and event handlers
    audio.js       - Web Audio API management
    chart.js       - Chart loading and validation
    game.js        - Game loop and rendering
    input.js       - Keyboard input handling
    ui.js          - UI updates and DOM manipulation
    utils.js       - Constants and helper functions
  index.html       - Main HTML structure
  style.css        - High-contrast theme styling
```

### Technologies Used

- **Vanilla JavaScript (ES6 Modules)** - No frameworks needed!
- **Web Audio API** - Precise audio playback and synthesis
- **Canvas API** - High-performance game rendering
- **LocalStorage API** - Settings and score persistence

### Browser Compatibility

Works in all modern browsers that support:
- ES6 modules
- Web Audio API
- Canvas 2D
- LocalStorage

## 🐛 Troubleshooting

### Notes appear too early/late
Adjust the **Audio Offset** in settings. Increase if notes appear early, decrease if they appear late.

### Audio doesn't play
- Check that the audio file path is correct in the chart JSON
- Make sure the browser allows autoplay (you may need to interact with the page first)
- The game will use beep tones if the audio file can't be loaded

### Keys don't respond
- Make sure you're not in settings mode
- Try clicking on the game area to ensure focus
- Check that your custom key bindings don't conflict with browser shortcuts

## 📝 License

This is a learning project - feel free to modify and use it however you like!

## 🎉 Have Fun!

Enjoy playing and creating your own rhythm game charts!

## 🎰 Casino Port (AllIn1 Gaming)

This game has been ported into the AllIn1 sweepstakes casino as **Fundora
Rhythm** (branch `claude/rhythm-casino-integration-x9nc2i` in
`ezsweeps247/allin1`), reworked as a dual-currency casino game:

- **Wager**: play for free with Gold Coins (GC), or wager Sweeps Cash (SC —
  operator-gated behind `RHYTHM_SC_ENABLED`).
- **Provably fair charts**: instead of MP3s + runtime beat analysis, the note
  chart (presence, lane, and value tier per 8th-note slot) is dealt from an
  HMAC-SHA256 server-seed/client-seed/nonce roll stream, verifiable after the
  round from the revealed seeds. The beat track is synthesized at the chart's
  BPM, so no audio assets ship.
- **Payout**: each note carries a value (NORMAL / GOLD 6x / DIAMOND 150x);
  the payout is the accuracy-weighted collected value using this game's
  original judgment windows (±35/70/110 ms) and weights (1.0/0.7/0.3),
  normalized so a perfect run has EV exactly the configured RTP — bounding
  even a dishonest client by the house edge. Capped at 20x the stake.
- **What was kept from this repo**: the 4-lane layout, judgment windows and
  weights, grade thresholds (S/A/B/C), score values, approach timing, and the
  beep-tone fallback concept. Input gained touch lanes for Telegram WebApp.

See `server/games/rhythm-engine.ts`, `server/games/rhythm.ts`, and
`client/src/pages/rhythm.tsx` in the allin1 repo.
