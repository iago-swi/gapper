# Gapper · Neon Circuit

Trace every rail while a seeker closes in. The cyan runner keeps moving in its current direction. Queue your next turn before the junction, then cut the rail behind you to buy time.

**[Play it in your browser](https://iago-swi.github.io/gapper/chatgpt/)**

**Play offline.** Download [Gapper.html](https://raw.githubusercontent.com/iago-swi/gapper/main/chatgpt/Gapper.html), save it as an HTML file, and open it in a modern browser. It includes the scripts, styles and skyline image. To work on the source, clone the repository and open this folder’s `index.html`. Both editions run directly from disk.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer or queue a turn | Arrow keys or WASD | Direction pad or swipe the playfield |
| Break the last completed rail | Space | Cut gap |
| Pause or resume | P | Pause or Resume |

## How the game works

The runner starts with three lives. The first crossing of a rail earns 10 points. A collision costs one life and preserves all traced rails. Completing the circuit awards another 100 points multiplied by the current level. Three handcrafted layouts cycle as the seeker gets faster.

The level is an undirected graph. Junctions and intermediate grid points are nodes, and each unit-length rail has one identifier shared by both directions. The seeker uses breadth-first search at each node to find a shortest route toward the runner’s destination. Cutting a gap makes that rail unavailable to both actors for 3.6 seconds of play. Only one gap can be open, and a rail occupied mid-crossing is protected.

## Implementation

| File | Responsibility |
| --- | --- |
| [engine.js](engine.js) | Builds the rail graphs and advances movement, pursuit, gaps, scoring, lives and level transitions. |
| [arcade.js](arcade.js) | Connects input to the engine, draws the board and sprites with Canvas 2D, updates the scoreboard and synthesizes sounds with the Web Audio API. |
| [screen.css](screen.css) and [index.html](index.html) | Define the cabinet, responsive layout, touch controls and instructions dialog. |
| [midnight-city.png](midnight-city.png) | The custom pixel-art skyline generated for this edition. |
| [Gapper.html](Gapper.html) | Portable, single-file edition containing the same game and artwork. |

The renderer uses `requestAnimationFrame` and elapsed time for movement. It caches the rail layer between board changes and draws moving sprites and particles over it. Switching to another tab pauses an active game. The browser stores the high score and sound preference locally under `gapper.best` and `gapper.sound`. There are no runtime package dependencies, accounts or server requests required to play.

[Game history and gameplay screenshot](../README.md)
