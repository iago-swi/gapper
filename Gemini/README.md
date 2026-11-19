# GAPPER // PRISM — Gemini version

A modern luminous synth-glass reimagining of the 1986 MS-DOS arcade classic *Gapper*, built with Gemini (Google). Glide along glowing optical conduits suspended over a real-time WebGL 2 aurora nebula, enclose staggered rectangular chambers to ignite crystalline prism tiles, and sever rails behind you with crackling high-voltage **Plasma Gaps** to stun or trap pursuing Seekers.

All WebGL 2 shaders, dual-scale Gaussian HDR bloom, radial shockwave refraction, architectural board rendering, and Web Audio synthesizer sounds run locally in the browser with zero external libraries, build steps, or media files.

**[Play it in your browser](https://iago-swi.github.io/gapper/Gemini/)**

![GAPPER // PRISM gameplay: glowing smoked-obsidian circuit monolith over a deep aurora nebula, with illuminated golden crystalline chambers, molten traced conduits, a crackling cyan Plasma Gap, and a crimson Seeker in pursuit](screenshot.png)

## Run it

Download or clone this repository and open `Gemini/index.html` directly in Chrome, Edge, or Firefox. Because modules load via standard `<script>` tags under a shared `window.Gapper` namespace, the game works identically over `file://` (double-click) or any static HTTP server with zero installation or bundler required.

## How to play

Navigate along the conduits of an irregular architectural grid. Every segment you traverse ignites from cool optical sapphire into molten plasma; enclosing all perimeter segments of a chamber seals it in crystalline light, chaining combos and recharging your Gap arcs. Seal every chamber to illuminate the sector and advance.

| Key | Action |
| --- | --- |
| Arrow keys or `WASD` | Move along conduits (with corner-assist & input buffering) |
| `Space`, `Shift`, or `E` | Sever the rail behind you to drop a crackling **Plasma Gap** |
| `Enter` | Launch Sector / Next Sector / Play Again |
| `P` or `Esc` | Pause / Resume |
| `R` | Restart current sector |
| `M` | Toggle procedural Web Audio synthesizer |

Touchscreen devices automatically display an on-screen directional pad and **GAP** trigger, and standard HTML5 Gamepad controllers are also supported.

| Mechanic / Entity | Behaviour |
| --- | --- |
| **Plasma Gap (`Space`)** | Carves a temporary `4.8 s` high-voltage rift in the rail behind you (up to 3 charges, shown as orbiting diegetic motes around your sprite and in the HUD; recharges passively every `4.2 s` plus `+0.5` per sealed chamber). Neither you nor Seekers can cross an active Gap. |
| **Gap Block & Trap** | A Seeker colliding with an active Gap recoils and is stunned for `1.35 s` (`+150 BLOCKED!`, `+0.35` Gap recharge). Boxing a Seeker between Gaps so it has no open exit overloads and shatters it (`+500 TRAPPED!`). |
| **Prism Overdrive** | Each sector marks its **4 corner chambers** with pulsing golden diamonds. Sealing all four triggers `6.5 s` of **Prism Overdrive**: Seekers slow to `72%`, flee in glitchy cyan, and can be rammed for escalating `+400 × N` shatter bonuses. |
| **Data Shards** | Periodic golden octahedron crystals spawn on distant junctions for `9.5 s`, awarding `+300` and an instant full Gap charge refill. |
| **Combo Chain** | Sealing chambers within `4.6 s` of each other escalates the multiplier up to `×8`. Closing two adjacent chambers with a single rail triggers a **Double Seal (`2×`)** with hit-stop and radial shockwave refraction. |

## Technical notes

### Stack & modular layout

| | |
| --- | --- |
| Delivery | Zero runtime dependencies, zero build step, zero external assets (optional Google Fonts with clean system fallbacks). Works offline over `file://` or HTTP. |
| Language | Plain JavaScript (ES2020) organized into 6 clean modules under `window.Gapper`. |
| Rendering | Hybrid high-DPI Canvas 2D architectural vector scene piped into a 4-pass **WebGL 2 (GLSL ES 3.00)** post-processing & procedural nebula pipeline, with automatic Canvas 2D fallback. |
| Audio | Real-time procedural **Web Audio API** synthesizer with master dynamics compressor, filtered ambient drone, pentatonic rail plucks, harmonic seal chords, and noise-shaped plasma SFX. |
| Storage | Single `localStorage` key, `gapper_prism_best`, persisting the high score. |

```text
Gemini/
├── index.html       # Semantic HUD, title/sector picker, overlays, and canvas mount
├── styles.css       # Frosted obsidian-glass UI, SVG progress ring, and touch controls
├── screenshot.png   # Gameplay preview
├── README.md        # Technical documentation
└── js/
    ├── levels.js    # 6 handcrafted sectors, palettes, planar graph & void-cutout builder
    ├── audio.js     # Procedural Web Audio API synthesizer & dynamic ambient drone
    ├── shaders.js   # 4-pass WebGL 2 bloom, procedural aurora void, shockwaves & ACES tone map
    ├── renderer.js  # High-DPI 2.5D monolith slab, crystalline tiles, plasma arcs & sprites
    ├── game.js      # Core simulation, continuous interval painting, BFS Seeker AI & attract demo
    └── main.js      # DPR resize handling, HUD sync, keyboard/touch/gamepad wiring & RAF loop
```

### Planar graph & void-cutout builder (`js/levels.js`)

Rather than hard-coding uniform grids or manual edge tables, each sector is defined declaratively as a set of non-overlapping axis-aligned rectangles `[x, y, w, h]` on an integer coordinate plane:

1. **Vertex extraction:** Collects all rectangle corners and every horizontal-vertical border intersection into a deduplicated node table, automatically supporting arbitrary T-junctions and staggered brick layouts.
2. **Atomic edge splitting:** Sorts vertices along each row and column and emits atomic conduit segments wherever consecutive nodes lie on any rectangle's perimeter, populating 4-way directional adjacency links (`up`, `down`, `left`, `right`).
3. **O(1) chamber binding:** Each edge stores the 1 or 2 `cells` it borders, and each cell stores its complete set of perimeter `edges`.
4. **Architectural void detection:** Scans the bounding grid for uncovered sub-rectangles and merges maximal uncovered regions into `voidRects` (used in Sectors 03 and 05 to punch transparent abyss windows directly through the obsidian glass monolith).

### Continuous edge painting & corner-assist movement (`js/game.js`)

- Entities transition cleanly between explicit `'node'` and `'edge'` states, with speed scaled proportionally to `cellPx` and edge length so visual velocity stays uniform across varying segment sizes and viewport resolutions.
- **Continuous interval merging:** Instead of snapping edges binary on arrival, traversing along an edge continuously appends `[prevT, nextT]` intervals and merges overlapping spans (`ε = 0.025`). Reversing mid-segment preserves partial progress; meeting the painted tip from the opposite direction fuses the interval and completes the rail once coverage spans `[0.035, 0.965]`.
- **Arcade corner forgiveness:** Input holds and a `240 ms` turn buffer snap cleanly around perpendicular corners within `22%` of an endpoint, while opposite-direction inputs reverse instantaneously anywhere along a rail.
- **Live attract-mode AI:** On the title screen, a lightweight autonomous Gapper navigates toward unpainted rails while evading Seekers and deploying Plasma Gaps behind the glassmorphic menu.

### Multi-pass WebGL 2 optical pipeline (`js/shaders.js` + `js/renderer.js`)

Each animation frame renders in two cooperating layers:

1. **High-DPI 2D Architectural Scene (`js/renderer.js`):** Renders onto an offscreen transparent canvas (up to `2×` DPR) with:
   - A 3D-extruded smoked-obsidian glass chassis with diagonal specular sheen and `destination-out` carved void windows.
   - Real-time additive ambient light pools cast onto the glass surface beneath the player, each Seeker, and every flickering Plasma Gap.
   - Sealed chambers featuring animated diagonal light-sweeps and procedural geometric circuit filigree (`patternSeed`).
   - Physically carved Plasma Gaps with molten end-caps, procedural dual-bolt jittering lightning arcs, and circular heal-progress halos.
2. **4-Pass WebGL 2 GPU Compositor (`js/shaders.js`):**
   - **Pass 1 (Bright-pass extraction):** Extracts high-luminance and high-saturation emissive neon pixels into a half-resolution FBO.
   - **Pass 2 (Tight 9-tap separable Gaussian blur):** Horizontal + vertical half-resolution blur for crisp luminous conduit halos.
   - **Pass 3 (Wide atmospheric blur):** Two iterations of quarter-resolution separable Gaussian blur for lush anamorphic radiance.
   - **Pass 4 (Final optical composite):** Synthesizes the domain-warped FBM aurora nebula, perspective horizon grid, and parallax starlight motes directly in GLSL; applies up to 4 simultaneous radial shockwave UV refractions (`uShock0..3`) and impact RGB chromatic aberration (`uChroma`); composites scene + tight bloom + wide bloom + horizontal anamorphic streak; and finishes with **ACES filmic tone mapping**, soft vignette, and animated micro film-grain dithering.

### Sectors & Seeker AI

| Sector | Name | Grid | Chambers | Void Cutouts | Seekers |
| --- | --- | --- | --- | --- | --- |
| 01 | Prism Circuit | 10 × 6 | 12 | — | 1 Hunter |
| 02 | Emerald Lattice | 12 × 6 | 14 | — | 1 Hunter, 1 Stalker |
| 03 | Solar Citadel | 12 × 8 | 18 | 1 Central Void | 1 Hunter, 1 Stalker |
| 04 | Cryogenic Nexus | 12 × 8 | 17 | — | 1 Hunter, 1 Stalker, 1 Surge |
| 05 | Twin Monoliths | 14 × 8 | 16 | 2 Twin Voids | 1 Hunter, 1 Stalker, 1 Surge |
| 06 | Hypercube Core | 14 × 8 | 20 | — | 2 Hunters, 1 Stalker, 1 Surge |

- **Crimson Hunter:** Runs real-time BFS shortest-path routing across all un-gapped rails directly toward the player's nearest junction.
- **Violet Stalker:** Targets 2 junctions ahead of the player's current facing direction to pincer escape routes.
- **Solar Surge Sentinel:** Engages a `1.38×` velocity surge with white-gold spark trails whenever traveling straight across consecutive junctions.
- All Seekers dynamically respect active Plasma Gaps during pathfinding, stun and recoil on mid-rail Gap impacts, and gently ramp speed (`+14%`) as sector completion rises.

### Procedural Web Audio synthesizer (`js/audio.js`)

All audio is generated live via the Web Audio API through a master `DynamicsCompressorNode`:
- Dual-oscillator (`sawtooth` + `triangle`) ambient drone routed through a resonant low-pass filter whose cutoff (`210 Hz` → `550 Hz`, or `760 Hz` in Overdrive) and gain open smoothly with sector completion.
- Pentatonic crystalline plucks when completing rails, polyphonic major-9th arpeggiated chords that ascend in pitch with combo chains, filtered white-noise plasma crackles on Gap creation/blocks, and sweeping fanfares for Overdrive and Sector Clear.

[Game history and comparison overview](../README.md)
