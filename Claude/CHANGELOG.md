# Lightloom changelog

What changed in each version of Lightloom, newest first. The version number is shown
on the game's title screen. Each version is also a
[release on GitHub](https://github.com/iago-swi/gapper/releases?q=Lightloom), with the
standalone game of that version attached. The numbering rules are in
[VERSIONING.md](../VERSIONING.md).

## 1.3.1 (2026-11-21)

### Changed

- Closing a square no longer bends or shakes the picture. The shockwave ripple, the
  camera shake and the color fringe are gone at that moment, so the shuttle and the
  moths stay easy to follow.
- The ring of light around a freshly lit square, which shows how far the stun reaches,
  is fainter.

## 1.3.0 (2026-11-21)

### Added

- "Title screen" button on the game-over screen, next to "Weave again". `Esc` does
  the same.
- "End this run" button on the pause screen. The run ends like any other, so its
  score is saved and listed.
- The version number on the title screen.

### Changed

- With practice mode on, the PAX badge on the title screen sits a little lower, below
  the version number.

## 1.2.0 (2026-11-20)

### Added

- High-score list kept in the browser: the ten best scores with three initials, the
  weave reached and the date. It is shown when a game ends and opens from the title
  screen under "High scores".
- Initials field next to the list. The initials are remembered for the next game.
- A second list, "Everyone", shared between all players. Every finished game with a
  score is sent there with the initials, and nothing else about the player.
- `scores-worker/`: the web service behind the shared list (Cloudflare Worker with a
  D1 database).

### Changed

- A best score from an earlier version is carried over into the new list.
- Runs played in practice mode are not entered in either list.

## 1.1.0 (2026-11-20)

### Added

- A choice of controls on the title and pause screens. Third person: four keys point
  the way, as before. First person: left and right turn the shuttle from its heading.
  The choice is remembered.
- Practice mode, hidden: type `PAX` to switch it on or off. The moths cannot hurt the
  shuttle, and a run played this way does not count toward the best score.

### Changed

- A sideways turn pressed just after a knot is taken at that knot, so a slightly late
  key press no longer costs a whole thread.

## 1.0.0 (2026-11-19)

First version.

- A line-weaving arcade game drawn with WebGL 2: run the shuttle along every thread,
  close a square to light it, and stay ahead of the moths. A freshly lit square stuns
  the moths close by.
- Eight board sizes, chains that multiply the score, a speed bonus for each weave and
  three sparks to start with.
- Music and sound effects synthesized in the browser.
- Keyboard and touch-screen steering, pause, mute and full screen.
- The best score is kept in the browser.
- `Lightloom.html`, the whole game in a single file for playing offline.
