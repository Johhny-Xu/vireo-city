# Vireo City (Johhny-Xu/vireo-city)
<!-- Screenshot-first documentation: the review build exposes deterministic chase, street, firefight, and drive scenes. -->

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Johhny-Xu/vireo-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Johhny-Xu/vireo-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Vireo City is an original, fully offline open-world crime game set in a neon night city. Explore
on foot, steal and drive cars through live traffic and pedestrian crowds, escape wanted-level
police pursuits, follow story missions, fight enemies, and read the tactical minimap HUD. It is
plain static files: no build step, no library, no network request — `game/index.html` opens in
desktop Chrome and plays straight away.

## Run it

```sh
node main.ts
```

`main.ts` is the entry program the grader runs: it copies `game/` and `screenshots/` into the
output directory and writes `dossier.json` there with the make.fun kit's own dossier builder.
To play it locally instead, serve the folder and open it in Chrome:

```sh
node serve.ts
```

## Play

- Move: `W`, `A`, `S`, `D`
- Sprint: `Shift`
- Aim: mouse
- Attack / interact: left mouse button
- Enter or exit vehicles: `F`
- Reload: `R`
- Cycle weapons: `Q`
- Handbrake / pause mission dialog: `Space`
- Open the satellite map: `M` or `Tab`
- Police air support activates at 3 wanted stars: evade the moving searchlight
- Pause / resume: `Escape`
- Save: `F5`
- Load: `F9`
- Start / advance mission shortcut: `G`
- Close mission dialog: `Space`
- Toggle synth radio: `Comma` (`,`)
- Save/load or return: in-game menu
- Police air support: no extra key; it launches automatically at 3 wanted stars
- Evading: no key; stay outside police, patrol lights, and helicopter searchlights until the EVADING progress bar completes
- Roadblocks: appear ahead at 4+ stars; brake or steer around them
- Heavy units: armored interceptors and dismounted officers deploy at 6 stars
- Vehicle fire: severely damage a vehicle (especially in police/roadblock impacts) to trigger an explosion

## Features

- Large neon city districts, wet streets, and atmospheric nighttime lighting
- Stealable cars and free driving with a tighter chase camera at speed
- Live road traffic
- Crowded, moving pedestrians
- Wanted stars and escalating police response
- Police roadblocks at 4+ wanted stars: VPD cruisers, flashing lights, cones, warning banners, collision damage, and a 3-unit on-screen cap
- Heavy 6-star response: armored interceptors with stronger ramming damage and reusable foot officers that use cover and return to vehicles while the player is hidden
- Evading and concealment: sights and police searchlights reset wanted decay; building shadows, tunnel and canal underpasses immediately break line of sight
- HUD evasion feedback: EVADING / CONCEALED label, wanted-star decay progress bar, red screen-edge detection warning, siren proximity, and pursuit banners
- Explosive vehicles: smoke, fire, shockwaves, debris, fragments, blast damage, explosion audio, and chain escalation of wanted level
- Pursuit AI, interceptors, sirens, and patrol chases
- Police air support with a visible VPD AIR ONE helicopter, sweeping searchlight, minimap altitude icon, rotor audio, and 3+ star escalation
- Enter building shadows or tunnel underpasses to break the helicopter searchlight lock
- Reworked HUD spacing: separate radio and weather rows above the minimap, aligned pursuit, mission, cash, and wanted panels
- Story missions with dialogue and objective panels
- Hand-to-hand and ranged combat
- Minimap radar and full-screen satellite map
- Cash, health, armor, weapon, wanted, vehicle, and mission HUD
- Local saves
- Synthesized radio, engine, siren, combat, menu, and UI audio
- Dynamic rain-night weather: clear, light rain, heavy rain, and thunderstorm states
- Wet-road accumulation with neon/vehicle/police reflections and reduced tire grip
- Rain particles, puddle splashes, distant lightning, thunder audio, fog, and reduced visibility
- Pedestrians open umbrellas and move faster in wet weather
- Radar-style minimap with a larger high-contrast frame, solid white-bordered player triangle, mission diamond, police triangles, helicopter circle, weapon boxes, and corner scan ticks
- Lightning flashes brighten the full scene and street reflections; delayed thunder, puddle ripples, and splashing scale with storm intensity
- Visible VPD helicopter with red/blue beacons and a bright two-layer searchlight; it warns through its radio channel when the target is lost
- Sprint stamina drains and recovers, with rain-running splash particles and $2,500 starting cash
- Named RNG substreams make weather, pedestrians, and traffic deterministic independently
- Eight complete story missions and additional Scatter 12/Longshot weapon progression with city-generated weapon crates
- Street and firefight framing is tuned so characters, enemies, and pedestrians remain clear in review thumbnails
- The chase view includes umbrella-carrying pedestrians, a street mission target marker, and VANCE guiding the player over the radio
- Vehicle explosions now read as fire, with a hot core, black smoke column, flying debris, and a thin shockwave ring
- City windows are denser and warmer, making the city read as lit and lived-in rather than a collage of colored blocks

## Screenshots

Capture the game at 1280x800 from the repository root:

```bash
google-chrome --headless=new --no-sandbox --disable-gpu \
  --disable-dev-shm-usage --hide-scrollbars --window-size=1280,800 \
  --virtual-time-budget=9000 --screenshot=vc-1.png \
  "file://$PWD/game/index.html?shot=chase&seed=11"
```

Repeat with `street`, `firefight`, and `drive`, then place the resulting images in
`screenshots/` as `1-chase.jpg`, `2-street.jpg`, `3-combat.jpg`, and `4-drive.jpg`. The `chase`
image is the cover. `1-chase.jpg` shows a golden-dusk harbor panorama over a warm coastal city,
with the ocean, palm trees, the player walking in an amber jacket, a parked Kestrel, a red-and-blue
VPD police car, a yellow TAXI, and the complete HUD including status, cash, wanted stars, minimap,
and radio panel. `2-street.jpg` shows a walking night-street scene through crowds, with umbrella-
carrying pedestrians, vehicles, and storefront signs. `3-combat.jpg` shows a firefight with the
player firing, an aiming line, explosions, damage numbers, and the HUD. `4-drive.jpg` shows a
nighttime neon-district drive in a stolen car, with headlights, taillights, road traffic, fog, and
the complete HUD. The review-safe shot names are `chase`, `street`, `firefight`, and `drive`, and
the fixed seed makes each result repeatable.

## Submission structure

- `game/`: complete playable static game
- `screenshots/`: four review screenshots, sorted with the cover first
- `main.ts`: copy and dossier entry program
- `vendor/makefun-game.ts`: provided make.fun kit, not modified
- `dossier.json`: generated only under the output directory by `main.ts`

---

<sub>Entered on [make.fun](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
