# Prism changelog

What changed in each version of Prism, newest first. The current version number is shown on the game's title screen. Each version is also published on the [GitHub Releases page](https://github.com/iago-swi/gapper/releases?q=Prism). The numbering rules are in [VERSIONING.md](../VERSIONING.md).

## 1.2.1 (2026-11-21)

### Added

- Current version number shown on the title screen.

## 1.2.0 (2026-11-20)

### Added

- Local high-score list (**This device**) keeping the ten best runs with up to three initials, sector reached, and date.
- **High scores** button next to your best score on the title screen to browse the leaderboards between runs.
- **Your initials** input below the leaderboard on the game-over screen, remembered for future runs.
- Shared leaderboard (**Everyone**) across all players of Prism, backed by Prism's own `prism-scores` score service (`scores-worker/`).

### Changed

- Existing best scores stored on the device carry over as the first entry of the new list.
- Practice-mode runs are excluded from both high-score lists.

## 1.1.0 (2026-11-20)

### Added

- Control scheme chooser on the title and pause screens: **Third person** (four-direction steering) and **First person** (relative left/right steering with automatic movement), remembered between visits.
- Hidden practice mode: type `PAX` on any screen to make the ship invulnerable to Seekers while excluding the run from best scores.

### Changed

- Steering keys respond immediately on key press rather than waiting for the next frame, with auto-repeat ignored.
- Pressing the opposite direction in third person reverses the ship immediately mid-rail.
- Pressing a sideways turn up to 30% of a rail past a junction takes the turn at that junction with smooth easing, leaving the abandoned rail untraced.
- Touch swipes in third person register within 16 pixels, and first-person touch controls act on touch-down with left/right buttons or left/right screen taps.

## 1.0.0 (2026-11-19)

First version.

- Six handcrafted sectors of staggered rectangular chambers, including architectural abyss cutouts and a starting-sector picker on the title screen.
- Continuous conduit painting, combo multipliers, double-seal bonuses, and **Prism Overdrive** triggered by sealing all four corner chambers.
- **Plasma Gap** defense (`Space`) to sever the rail behind you, stun pursuing Seekers, or shatter trapped Seekers, plus **Data Shard** pickups.
- Three escalating Seeker types (Hunter, Stalker, and Surge) with shortest-path and intercept routing.
- Real-time WebGL 2 bloom, aurora nebula, shockwave refraction, and synthesized Web Audio music and sound effects.
- Keyboard, touch-pad, and gamepad controls, pause, mute, and local best-score storage.
