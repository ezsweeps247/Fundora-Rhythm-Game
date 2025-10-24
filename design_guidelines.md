# Design Guidelines: 4-Lane Keyboard Rhythm Game

## Design Approach

**Selected Approach:** Hybrid (Game-Optimized Design System)
- Primary inspiration: OSU!, Friday Night Funkin', and arcade rhythm games
- Focus on maximum readability, instant visual feedback, and minimal distraction during gameplay
- Clean interface during menu/settings, high-contrast clarity during gameplay

**Key Design Principles:**
1. Readability First: All gameplay elements must be instantly recognizable at a glance
2. Visual Clarity: High contrast between active elements and background
3. Responsive Feedback: Immediate visual confirmation for all interactions
4. Minimal Distraction: UI elements fade during gameplay to focus on notes and judgment

---

## Core Design Elements

### A. Typography

**Font Stack:**
- Primary: 'Press Start 2P' (Google Fonts) for headers and game UI - authentic retro game feel
- Secondary: 'Inter' or 'Roboto' (Google Fonts) for settings and long-form text - modern readability
- Fallback: monospace, sans-serif

**Type Scale:**
- Hero/Title: 32px (2rem) bold - menu titles, results screen
- Gameplay HUD: 24px (1.5rem) bold - score, combo counter
- Judgment Text: 40px (2.5rem) bold - Perfect/Great/Good/Miss feedback
- Body/Settings: 16px (1rem) regular - settings panel, descriptions
- Small/Labels: 14px (0.875rem) regular - key bindings, help text

### B. Layout System

**Spacing Units:** Tailwind units of 2, 4, 6, 8, 12, 16, 24
- Tight spacing (p-2, m-2): Between lane dividers, HUD elements
- Standard spacing (p-4, m-4): Canvas padding, button spacing
- Generous spacing (p-8, m-8): Section separation in menus
- Extra spacing (p-12, p-16): Top-level container margins

**Canvas Layout:**
- Game Canvas: Fixed 800px width × 600px height (centered)
- Responsive: Scale down proportionally on smaller screens while maintaining aspect ratio
- Container: max-w-6xl mx-auto for all menu/settings screens

**Grid Structure:**
- 4-Lane Grid: Equal width lanes (25% each) with visible lane dividers
- Hit Line: Positioned at 80% from top of canvas (480px from top in 600px canvas)
- Note Spawn: Top of canvas (0px)
- Approach Distance: 1200ms travel time from spawn to hit line

---

## C. Component Library

### Navigation & Menus

**Main Menu:**
- Full-screen centered layout
- Game title at top (p-8 margin)
- Song selection dropdown (w-80, centered)
- Primary action buttons in vertical stack (space-y-4)
- Settings button in bottom-right corner (fixed position)

**Top Bar (During Gameplay):**
- Minimal height (h-12)
- Song title left-aligned (pl-4)
- Pause button (P key) right-aligned (pr-4)
- Progress bar underneath (h-1, full width)

**Settings Panel:**
- Modal overlay (centered, max-w-md)
- Sections with clear labels: Volume, Audio Offset, Key Bindings
- Slider controls with numerical value display
- Key remap buttons showing current and new key side-by-side
- Save/Cancel buttons at bottom (space-x-4)

### Gameplay Elements

**Lane Dividers:**
- Vertical lines (w-0.5) spanning full canvas height
- Slightly transparent to avoid distraction
- 3 dividers creating 4 equal lanes

**Hit Line:**
- Horizontal line (h-1) spanning full canvas width
- Glows/pulses subtly on successful hits
- Most visually prominent horizontal element

**Notes:**
- Rectangles: 60px width × 20px height
- Rounded corners (rounded-md)
- Each lane has distinct visual treatment (borders, fills)
- Drop shadow for depth perception

**Judgment Feedback:**
- Appears at hit line position
- Large text (40px) with fade-out animation (300ms duration)
- Different visual weight per judgment: Perfect (bold + glow), Great (bold), Good (regular), Miss (thin)

### HUD Elements

**Score Display:**
- Top-left corner (absolute positioning)
- Large numbers (24px)
- Updates smoothly with each hit

**Combo Counter:**
- Top-right corner (absolute positioning)
- Shows current combo with "x" prefix (e.g., "x47")
- Resets with animation on combo break

**Accuracy Meter:**
- Below score (top-left area)
- Percentage format (e.g., "97.5%")
- Updates in real-time

**Current Judgment:**
- Center of canvas, slightly above hit line
- Fades out after 300ms
- Overlays gameplay without blocking notes

### Results Screen

**Layout:**
- Full-screen centered card (max-w-2xl)
- Song title at top
- Large final score display (48px)
- Grid layout for statistics (grid-cols-2 gap-4):
  - Max Combo
  - Accuracy
  - Perfect count
  - Great count
  - Good count
  - Miss count
- Grade badge (S/A/B/C) - large, prominent
- Action buttons at bottom: Retry, Menu (space-x-4)

### Form Controls

**Buttons:**
- Primary: Large hit area (px-6 py-3), bold text, rounded-lg
- Secondary: Same size, different visual treatment
- Icon buttons: Square (w-10 h-10), rounded-md

**Sliders:**
- Volume: 0-100%, visual fill indicator
- Audio Offset: -100ms to +100ms, center marker at 0ms, 5ms increments
- Track height (h-2), thumb size (w-4 h-4)

**Dropdowns:**
- Song selection: Full width in menu, shows song title
- Clear current selection indicator

**Key Remap Buttons:**
- Display current key in pill badge
- Click to enter "listening" state
- Show new key immediately on press
- Confirm/cancel options

---

## D. Visual Treatments

**High-Contrast Theme:**
- Use stark contrast between foreground and background
- No gradients or subtle transitions in gameplay area
- Clear visual separation between all interactive elements

**Note Colors (Per Lane):**
- Lane 0 (D): Cyan/Blue theme
- Lane 1 (F): Magenta/Pink theme
- Lane 2 (J): Yellow/Amber theme
- Lane 3 (K): Green/Emerald theme

**Judgment Visual Feedback:**
- Perfect: Bright white text with glow effect
- Great: Bright green text
- Good: Yellow/orange text
- Miss: Red text with no glow

**State Indicators:**
- Playing: Minimal UI, focus on canvas
- Paused: Overlay with semi-transparent backdrop, pause menu centered
- Menu: Full UI visibility
- Results: Celebration visual with confetti particles for S grade

---

## E. Responsive Behavior

**Breakpoints:**
- Desktop (lg: 1024px+): Full 800×600 canvas, side margins
- Tablet (md: 768px): Scale canvas to 90% width, maintain aspect ratio
- Mobile (sm: 640px): Scale canvas to 95vw, stack HUD elements vertically

**Touch Considerations:**
- On-screen key buttons for mobile (4 buttons below canvas)
- Larger hit areas for settings controls
- Swipe gestures for menu navigation

---

## Images

No images required for this rhythm game application. All visual elements are rendered programmatically on canvas or as DOM elements for optimal performance and crisp rendering at any resolution.