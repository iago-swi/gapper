# Versions and release notes

This repository holds three games. Each game has its own version number, its own
changelog and its own releases, so work on one game never touches the numbering of
another.

| Game | Folder | Tag | Changelog |
| --- | --- | --- | --- |
| Lightloom | `Claude/` | `lightloom-v1.3.0` | [Claude/CHANGELOG.md](Claude/CHANGELOG.md) |
| Neon Circuit | `ChatGPT/` | `neon-circuit-v1.0.0` | `ChatGPT/CHANGELOG.md` |
| Prism | `Gemini/` | `prism-v1.0.0` | `Gemini/CHANGELOG.md` |

The tags for Neon Circuit and Prism show the pattern; their numbers start when their
first release is made. All releases are listed on the
[Releases page](https://github.com/iago-swi/gapper/releases).

## Version numbers

A version has three numbers, `MAJOR.MINOR.PATCH`.

| Number | Raise it when | Example |
| --- | --- | --- |
| MAJOR | The game is reworked so that it plays differently, or saved scores no longer carry over. | 1.4.2 → 2.0.0 |
| MINOR | Players get something new: a feature, a screen, a control, a setting. | 1.3.0 → 1.4.0 |
| PATCH | Something is fixed or adjusted and nothing new is added. | 1.3.0 → 1.3.1 |

Raising a number sets the numbers after it back to zero.

## What gets a version

- Every change to a game that a player can notice gets a new version of that game.
- Changes to documentation only (a README, a screenshot, this file) get no version.
  They are committed as usual.
- Changes outside the game folders (the landing page, the main README) get no version.
- Several changes pushed together are one version, numbered by the largest of them.

## Steps for a new version

1. Decide the new number from the table above.
2. Update the version shown in the game, if the game shows one.
3. Add a section at the top of the game's `CHANGELOG.md`: the number, the date
   (`YYYY-MM-DD`), and the changes under "Added", "Changed", "Fixed" or "Removed".
4. Rebuild the game's standalone file, if it has one.
5. Commit, then pull with rebase and push.
6. Tag that commit and push the tag:

   ```sh
   git tag -a lightloom-v1.4.0 -m "Lightloom 1.4.0"
   git push origin lightloom-v1.4.0
   ```

7. Publish the release, with the changelog section as its notes and the standalone
   file attached:

   ```sh
   gh release create lightloom-v1.4.0 --title "Lightloom 1.4.0" --notes-file notes.md Claude/Lightloom.html
   ```

## Writing the notes

- Write for players, in plain language: what they can now do, or what no longer goes
  wrong. Leave out file names and internal details unless a developer needs them.
- One line per change. Start with the thing that changed.
- Say plainly when something was removed or behaves differently than before.

## Rules

- A tag that has been pushed is never moved or deleted. A mistake is corrected with a
  new version.
- Work only in your own game's folder, changelog and tags. Do not write release notes
  for another game.
- The "Latest" label on the Releases page goes to the newest release of any game. That
  is expected with three games in one repository.
