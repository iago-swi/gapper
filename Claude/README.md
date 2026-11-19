# Lightloom — Claude version

A line-weaving arcade game built with Claude (Anthropic), in the genre of *Gapper* and
*Amidar* but with its own theme: you run a shuttle of light along the threads of a
floating loom. Run the full length of a thread to weave it, close all four sides of a
square to light it, and stay ahead of the moths that hunt the light.

Graphics and sound are generated in the browser (WebGL 2 and Web Audio). There are no
image or audio files and no libraries.

**[Play it in your browser](https://iago-swi.github.io/gapper/Claude/)**

![Lightloom in play on the third weave, Verdigris: eight lit squares in blue-green glass, the shuttle at the centre of a shockwave, and two pink moths closing in](screenshot.jpg)

## Run it

Play online with the link above. To play offline, download [Lightloom.html](https://raw.githubusercontent.com/iago-swi/gapper/main/Claude/Lightloom.html),
save it as an HTML file and open it in a current version of Chrome, Edge, Firefox or
Safari. That single file contains the whole game. To work on the source, clone the
repository and open this folder's `index.html`. Both run directly from disk; no
installation, build step or web server is needed. The two typefaces load from Google
Fonts; without an internet connection the game falls back to system fonts.

## How to play

Steer the shuttle along the threads. It keeps moving in its current direction, so you
can press the next turn before you reach the knot. A thread is woven only once you
have run its whole length; turn back halfway and it unravels. A square lights when
its four threads are woven. Light every square to finish the weave.

| Key | Action |
| --- | --- |
| Arrow keys or `WASD` | Steer |
| `P` or `Esc` | Pause |
| `M` | Sound on/off |
| `F` | Full screen |
| `Enter` or `Space` | Start |

On a touch screen, swipe to steer.

Moths travel along the same threads and touching one costs a spark. You start with
three sparks. Your defence is the loom itself: a freshly lit square stuns every moth
within two squares of it for 1.8 seconds, and a stunned moth is harmless. Lighting
squares in quick succession builds a chain that multiplies their score. The best
score is kept in the browser.

## Technical notes

### Stack

| | |
| --- | --- |
| Delivery | `index.html` plus three scripts in `js/`, about 1370 lines (73 KB) in total. `Lightloom.html` is the same game with the scripts inlined. No dependencies, no build step. |
| Language | Plain JavaScript (ES2020) in classic scripts, no framework. |
| Rendering | WebGL 2 (GLSL ES 3.00) for the whole scene and post-processing. HTML and CSS for the score bar, banners and screens. |
| Sound | Web Audio API. Every sound is synthesized; there are no audio files. |
| Type | Instrument Serif and Sora from Google Fonts, with system fallbacks. |
| Storage | One `localStorage` key, `lightloom.best`, for the best score. |
| Requirements | A browser with WebGL 2. `EXT_color_buffer_float` is used for HDR render targets when present; otherwise the game falls back to 8-bit targets. |

| File | Responsibility |
| --- | --- |
| [js/gfx.js](js/gfx.js) | Matrix helpers, all shaders, render targets and the frame pipeline. |
| [js/game.js](js/game.js) | Board, rules, movement, moths, particles, camera, input, score bar and the frame loop. |
| [js/audio.js](js/audio.js) | Sequencer, instruments and sound effects. |
| [index.html](index.html) | Markup and CSS for the title, score bar, banners, pause and game-over screens. |
| [Lightloom.html](Lightloom.html) | Portable single-file edition. |

### The board

A weave of *c* × *r* squares is stored as three arrays: (*r* + 1) × *c* horizontal
threads, *r* × (*c* + 1) vertical threads, and *r* × *c* squares. Each thread holds a
woven flag; each square holds a lit flag and a count of its woven sides.

An actor (the shuttle or a moth) is a knot, a direction, a progress value from 0 to 1
along the current thread, and a sign for travel forward or back. Movement consumes a
distance budget per frame, so speed does not depend on the frame rate. A thread is
marked woven only when the shuttle arrives at its far knot. Reversing flips the sign
instead of swapping the end points, so going back to the knot you left weaves nothing
and the half-pulled thread retracts.

The most recently pressed direction is remembered and taken at the next knot where it
is possible. Pressing the direction opposite to travel reverses at once.

In portrait windows (aspect ratio under 0.8) columns and rows are swapped, so the
board stands upright on a phone.

### Rendering pipeline

Everything on the board is one of two instanced primitives.

- **Boxes.** A unit cube drawn with `drawArraysInstanced`, 14 floats per instance
  (center, scale, color, parameters). One fragment shader paints four kinds of box:
  thread, knot, lit square and the slab underneath. The largest board uses about 320
  instances in one draw call.
- **Billboards.** A quad, 13 floats per instance, either facing the camera or lying
  flat. The fragment shader computes the shape: a soft mote, the shuttle (core, halo
  and four rotating rays), a ring, or a moth. The moth is the union of three ellipse
  distance fields mirrored on the vertical axis, with the horizontal axis scaled by a
  sine to flap the wings. Blending is premultiplied (`ONE, ONE_MINUS_SRC_ALPHA`), so
  alpha 0 adds light and alpha 1 covers what is behind; glowing sparks and the dark
  body of a moth go through the same draw call.

Each frame runs these passes:

1. **Sky.** A full-screen shader. The view ray is projected onto a plane and fed to
   6-octave value noise, rotated between octaves and domain-warped twice, plus two
   layers of stars.
2. **Boxes**, with depth test and back-face culling.
3. **Billboards**, depth-tested but not written to the depth buffer.
4. **Resolve.** Passes 1 to 3 draw into a 4× multisampled `RGBA16F` renderbuffer,
   which is blitted to a texture.
5. **Bloom.** A threshold pass (0.85), then six levels of dual-filter downsampling
   and additive upsampling.
6. **Final grade.** Up to four shockwave distortions, a slice glitch when a spark is
   lost, chromatic aberration, tone mapping, a vignette and film grain.

Colors are kept in linear HDR until the last pass. A lit thread is brighter than 1.0,
and bloom spreads only that excess, which is why light bleeds from threads and
squares but not from the slab. The tone mapper is an even mix of the ACES curve
applied per channel and the same curve applied to the peak channel only; the second
half keeps bright colors from washing out to white.

The slab and the lit squares reflect the sky by calling the sky function again along
the reflected view ray, weighted by a Fresnel term. Light spilling from lit squares
onto the slab comes from a light map: a *c* × *r* RGBA texture uploaded every frame,
where RGB is the color of each lit square and alpha is the number of woven sides of
each unlit one. The slab shader averages nine bilinear taps of it and uses the alpha
channel to make a square glow faintly as its sides fill in.

The camera has a 36° field of view and looks down at 56°. Its distance and aim point
are found by bisection so that the projected corners of the board stay within 90% of
the width and 73% of the height of the window, which leaves room for the score bar.

The render resolution follows the device pixel ratio up to 2 and is capped at
3.7 megapixels. If 90 consecutive frames average under 45 frames per second, the
internal resolution drops by a fifth, down to half at most.

### Moths

At each knot a moth chooses among the exits other than the one it came from. With a
probability that rises with the weave it takes the exit closest to its target;
otherwise it picks at random.

| Moth | Target |
| --- | --- |
| First | The shuttle. |
| Second | A point 2.5 threads ahead of the shuttle. |
| Third | The shuttle, but it chases only 60% as often as the others. |

A moth touches the shuttle at a distance of 0.42 threads. After losing a spark the
shuttle returns to its starting knot and cannot be hit for 2.2 seconds.

### Difficulty and scoring

| | Weave 1 | Later |
| --- | --- | --- |
| Board | 6 × 4 | 7 × 4, 7 × 5, 8 × 5, 9 × 5, 9 × 6, 10 × 6, then 10 × 7 from weave 8 |
| Moths | 1 | 2 from weave 3, 3 from weave 6 |
| Shuttle speed (threads per second) | 4.3 | +0.11 per weave up to weave 9 |
| Moth speed (share of shuttle speed) | 60% | +3.5 points per weave, up to 90% |
| Chance that a moth chases at a knot | 62% | +5 points per weave, up to 95% |

A woven thread scores 10. A lit square scores 100 times the chain, which grows by one
for each square lit within 3 seconds of the last, up to 9. Finishing a weave under
par (2.4 seconds per square) adds 100 points per second saved. Every third weave
gives a spare spark, up to five.

The five dyes (Indigo, Saffron, Verdigris, Madder, Orchil) each set the thread color,
the two colors of the lit squares, the moth color and the two nebula colors. They
repeat from weave 6.

### Sound

A sequencer schedules sixteenth notes a quarter of a second ahead, polled every
50 ms. The harmony is one bar each of A minor, F, C and G. A pad of six detuned
sawtooth oscillators runs through a swept low-pass filter. During play a kick, a
noise hi-hat, a triangle bass and an arpeggio join in, with a feedback delay
(0.33 s) for space. The tempo starts at 99 beats per minute and rises by 3 per weave
up to 132.

Weaving a thread plays the next note of the A minor pentatonic scale over two
octaves, in the key of the music, and the run starts again after 1.1 seconds of
silence. Lighting a square plays a four-note figure whose root rises with the chain.

### Title screen

The board behind the title is the real game played by a simple bot. At each knot it
takes the unwoven thread next to the square with the most woven sides; when no
unwoven thread touches the knot, a breadth-first search finds the nearest one.

### Accessibility and behavior

- With `prefers-reduced-motion`, screen shake, shockwaves, the chromatic flash and
  the glitch are reduced to a quarter and the title animation is switched off.
- The game pauses when the window loses focus.
- Scores are formatted with Swiss thousands separators (16’440).

### Testing

`window.__loom` exposes the game state and a `tick(n, dt)` function that advances the
simulation by fixed steps. The game was checked with scripted runs through this hook
(weaving, chains, losing a spark, weave change, game over, phone layout), and with a
real click and real key presses for starting, steering and pausing. The screenshot
was taken from such a run. Sound was not checked by ear, and frame rate on slower
graphics hardware has not been measured.

[Game history and the other versions](../README.md)
