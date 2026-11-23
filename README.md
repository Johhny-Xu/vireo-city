# Vireo City

Vireo City is an original offline open-world crime game set in a neon night city. Explore
on foot or steal and drive vehicles through live traffic and pedestrian crowds, escape
wanted-level police pursuits, complete mission stories, fight enemies, and use the tactical
minimap HUD.

## Play

- Move: `W`, `A`, `S`, `D`
- Aim: mouse
- Attack / interact: left mouse button
- Enter or exit vehicles: `F`
- Reload: `R`
- Open the satellite map: `M` or `Tab`
- Pause or return: `Escape`
- Save: available from the in-game menu

## Features

- Large neon city districts, wet streets, and atmospheric nighttime lighting
- Stealable cars and free driving
- Live road traffic
- Crowded, moving pedestrians
- Wanted stars and escalating police response
- Pursuit AI, interceptors, sirens, and patrol chases
- Story missions with dialogue and objective panels
- Hand-to-hand and ranged combat
- Minimap radar and full-screen satellite map
- Cash, health, armor, weapon, wanted, vehicle, and mission HUD
- Local saves
- Synthesized radio, engine, siren, combat, menu, and UI audio

## Local run

The game is fully static and has no build step or network dependencies.

```bash
node serve.ts
```

Open `http://localhost:8080` in desktop Chrome.

## Screenshots

Capture the game at 1280x800 from the repository root:

```bash
/opt/google/chrome/chrome --headless=new --no-sandbox --disable-gpu \
  --disable-dev-shm-usage --hide-scrollbars --window-size=1280,800 \
  --virtual-time-budget=9000 --screenshot=/tmp/vc-1.png \
  "file://$PWD/game/index.html?shot=chase&seed=7"
```

Repeat with `street`, `mission`, and `title`, then place the resulting images in
`screenshots/` as `1-chase.jpg`, `2-street.jpg`, `3-mission.jpg`, and `4-title.jpg`.

## Submission structure

- `game/`: complete playable static game
- `screenshots/`: four review screenshots, sorted with the cover first
- `main.ts`: copy and dossier entry program
- `vendor/makefun-game.ts`: provided make.fun kit, not modified
- `dossier.json`: generated only under the output directory by `main.ts`
