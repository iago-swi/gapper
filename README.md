# Gapper

A neon browser remake of the 1986 DOS arcade game. Steer a ship along a network of rails and turn each one cyan. The pink seeker can follow you anywhere on the circuit until you cut a gap behind you.

| Version | Play offline | Source and technical notes |
| --- | --- | --- |
| ChatGPT · Neon Circuit | [Download the standalone game](https://raw.githubusercontent.com/iago-swi/gapper/main/chatgpt/Gapper.html) | [chatgpt/](chatgpt/) |

Save the standalone file as `Gapper.html` and open it in a browser. You can also download or clone this repository and open the root `index.html`.

## ChatGPT version

![Neon Circuit in play. Cyan rails mark the runner’s route, violet rails remain to be traced, and a pink seeker approaches the open gap.](chatgpt/screenshot.png)

Use the arrow keys or WASD to steer. Press **Space** after crossing a rail to break it behind you. On a touchscreen, use the direction pad and **Cut gap**.

## Game history

*Gapper* appeared on DOS in 1986. It belongs to the line-coloring tradition of *Amidar*. Each screen posed a route-planning problem. To finish the grid, the player had to cross every line while a single pursuer, the Seeker, tried to intercept them. Revisiting a junction was often necessary to reach a line left behind. [MobyGames](https://www.mobygames.com/game/32278/gapper/) · [Abandonware DOS](https://www.abandonwaredos.com/abandonware-game.php?abandonware=Gapper&gid=3218)

The move that gave *Gapper* its name let the player temporarily break a line. A well-timed gap forced the Seeker onto a longer route. It also blocked the player’s own return, so the position of the next junction mattered as much as the distance to the enemy. [Squakenet](https://www.squakenet.com/game/gapper/) · [Watch the DOS game](https://www.youtube.com/watch?v=hsFy7OdexQw&t=20s)

*Neon Circuit* brings that chase to the browser. The grid becomes a set of glowing rails above a pixel-art city, while the original decision survives on a single key. A gap buys you a few seconds to reach the next turn.

## Repository structure

```text
gapper/
├── chatgpt/       Game, editable source, screenshot and technical notes
├── index.html    Opens the available edition
└── README.md
```
