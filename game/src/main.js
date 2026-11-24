// Main game loop, state machine, fixed-timestep accumulator, and ?shot= deterministic renderer
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var canvas = null;
  var ctx = null;

  var FIXED_STEP = 1 / 60;
  var MAX_ACCUM = 0.25;
  var accumulator = 0;
  var lastTimestamp = 0;
  var gameTime = 0;

  var isShotMode = false;
  var shotType = null;

  function parseQueryParams() {
    var params = {};
    var search = window.location.search;
    if (search && search.length > 1) {
      var pairs = search.substring(1).split('&');
      for (var i = 0; i < pairs.length; i++) {
        var parts = pairs[i].split('=');
        var key = decodeURIComponent(parts[0]);
        var val = parts.length > 1 ? decodeURIComponent(parts[1]) : '';
        params[key] = val;
      }
    }
    return params;
  }

  // ── Shared shot scene helper ──────────────────────────────────────────────
  function basePlayingScene(x, y, cash, health, armor, wanted) {
    VC.gameState = 'playing';
    VC.player = new VC.Player(x, y);
    VC.player.cash   = cash   || 0;
    VC.player.health = health || 100;
    VC.player.armor  = armor  || 0;
    VC.player.wantedLevel = wanted || 0;
    if (VC.hud && VC.hud.setCashImmediate) VC.hud.setCashImmediate(cash);
    if (VC.wanted) VC.wanted.setLevel(wanted || 0, VC.player);
    if (VC.traffic)     VC.traffic.initDeterministic(VC.city, VC.player);
    if (VC.pedestrians) VC.pedestrians.initDeterministic(VC.city, VC.player);
  }

  function setupDeterministicShot(shot, seed) {
    isShotMode = true;
    shotType = shot;
    var shotCamera = null;
    VC.coverSign = false;
    VC.hiddenSignText = null;
    VC.dusk = false;
    VC.driveShot = false;

    var actualSeed = seed ? parseInt(seed, 10) : 1986;
    if (isNaN(actualSeed)) actualSeed = 1986;

    VC.RNG = new VC.Mulberry32(actualSeed);
    VC.city = VC.City.generate(actualSeed);
    if (VC.RNG.setSeed) VC.RNG.setSeed(actualSeed);
    if (VC.Weapons) VC.Weapons.syncWeaponCrateBoxes(VC.city);
    VC.camera.setBounds(0, 0, VC.city.worldWidth, VC.city.worldHeight);

    // ── title ──────────────────────────────────────────────────────────────
    if (shot === 'title' || shot === 'start') {
      VC.gameState = 'title';
      VC.Menu.state = 'title';
      VC.player = new VC.Player(1100, 1100);
      VC.camera.snapTo(1100, 1100);
      gameTime = 1.8;
      if (VC.weather) VC.weather.forceState('LIGHT_RAIN');
    } else if (shot === 'firefight') {
      var fightX = 900, fightY = 705;
      basePlayingScene(fightX, fightY, 5900, 82, 35, 2);
      VC.player.facing = -Math.PI * 0.72;
      VC.camera.snapTo(fightX, fightY);
      VC.camera.zoom = 2.2;
      shotCamera = { zoom: 2.2, leadDist: 70 };
      VC.Input.mouse.screenX = 880;
      VC.Input.mouse.screenY = 300;
      gameTime = 6.4;
      if (VC.Weapons) VC.Weapons.equip('scatter12');
      if (VC.police) {
        VC.police.seedState(1, VC.player);
        VC.police.seedFootOfficers(3, VC.player);
        var fightCruiser = new VC.Vehicle('interceptor', 1010, 632, 2.2);
        fightCruiser.speed = 0;
        fightCruiser.lightsOn = true;
        fightCruiser.sirenOn = true;
        fightCruiser.pursuitLights = true;
        VC.police.cruisers.push({
          vehicle: fightCruiser,
          shootTimer: 1.4,
          sirenPhase: 0,
          state: 'chase',
          disabled: false,
          heavy: false
        });
        var fightOfficers = VC.police.footOfficers;
        if (fightOfficers.length) {
          fightOfficers[0].x = fightX + 118; fightOfficers[0].y = fightY - 62;
          fightOfficers[1].x = fightX + 132; fightOfficers[1].y = fightY + 28;
          fightOfficers[2].x = fightX - 112; fightOfficers[2].y = fightY - 88;
          for (var oi = 0; oi < fightOfficers.length; oi++) {
            fightOfficers[oi].shootTimer = 0.08 + oi * 0.12;
            fightOfficers[oi].enemyColor = '#ff2aa1';
          }
        }
      }
      if (VC.Weapons) {
        VC.Weapons.muzzleFlashes.push({ x: fightX + 30, y: fightY - 18, angle: 0.2, life: 0.22, maxLife: 0.22 });
        VC.Weapons.muzzleFlashes.push({ x: fightX + 118, y: fightY - 62, angle: Math.PI, life: 0.28, maxLife: 0.28 });
        VC.Weapons.muzzleFlashes.push({ x: fightX - 112, y: fightY - 88, angle: 0.15, life: 0.24, maxLife: 0.24 });
        VC.Weapons.spawnImpactTracer(fightX + 30, fightY - 18, fightX + 155, fightY - 92, 'scatter12');
        VC.Weapons.spawnImpactTracer(fightX + 138, fightY - 82, fightX + 34, fightY - 22, 'vireo9');
        VC.Weapons.spawnImpactTracer(fightX + 178, fightY + 38, fightX + 42, fightY - 12, 'vireo9');
        VC.Weapons.spawnImpactTracer(fightX - 155, fightY - 118, fightX + 26, fightY - 24, 'vireo9');
        VC.Weapons.spawnImpactTracer(fightX + 118, fightY - 62, fightX - 18, fightY - 20, 'scatter12');
        VC.Weapons.spawnImpactTracer(fightX - 112, fightY - 88, fightX + 24, fightY - 12, 'scatter12');
        VC.Weapons.bulletDecals.push({ x: fightX + 155, y: fightY - 92, alpha: 0.9, life: 18 });
        VC.Weapons.bulletDecals.push({ x: fightX - 24, y: fightY + 18, alpha: 0.8, life: 18 });
        VC.Weapons.bulletDecals.push({ x: fightX + 82, y: fightY - 28, alpha: 0.75, life: 18 });
        VC.Weapons.bulletDecals.push({ x: fightX + 108, y: fightY + 46, alpha: 0.85, life: 18 });
        VC.Weapons.bulletDecals.push({ x: fightX - 68, y: fightY - 38, alpha: 0.8, life: 18 });
        VC.Weapons.bulletDecals.push({ x: fightX + 142, y: fightY - 105, alpha: 0.75, life: 18 });
        VC.Weapons.bulletDecals.push({ x: fightX - 142, y: fightY + 58, alpha: 0.72, life: 18 });
        VC.Weapons.bulletDecals.push({ x: fightX + 18, y: fightY + 82, alpha: 0.68, life: 18 });
        VC.Weapons.spawnShellCasing(fightX + 28, fightY - 14, 0.2);
      }
      if (VC.pedestrians) {
        VC.pedestrians.initDeterministic(VC.city, VC.player);
        if (VC.pedestrians.pedestrians.length >= 8) {
          var downed = VC.pedestrians.pedestrians[7];
          downed.x = fightX + 92;
          downed.y = fightY + 76;
          downed.downed = true;
          downed.heading = -1.05;
          downed.shirtColor = '#351d2a';
          downed.pantsColor = '#263238';
        }
      }
      if (VC.hud) VC.hud.toast('RECTO RUNNERS ENGAGED // COMBAT ZONE', 4.0);
      // Firefight comment: fixed enemy spacing and weapon ammo make shot=firefight repeatable.
      if (VC.weather) VC.weather.forceState('LIGHT_RAIN');

    // ── street ─────────────────────────────────────────────────────────────
    } else if (shot === 'street' || shot === 'play') {
      var spawnX = 740, spawnY = 705;
      basePlayingScene(spawnX, spawnY, 3400, 100, 50, 0);
      VC.player.facing = -Math.PI * 0.25;

      var nearCab = new VC.Vehicle('cab', 785, 723.5, 0);
      nearCab.speed = 0; nearCab.lightsOn = true;
      VC.player.nearVehicle = nearCab;
      if (VC.traffic) VC.traffic.vehicles.push({ vehicle: nearCab });

      VC.camera.snapTo(spawnX, spawnY);
      VC.camera.zoom = 2.4;
      shotCamera = { zoom: 2.4, leadDist: 70 };
      VC.Input.mouse.screenX = 720; VC.Input.mouse.screenY = 320;
      gameTime = 3.5;
      if (VC.pedestrians) {
        VC.pedestrians.MAX_PEDESTRIANS = 24;
        VC.pedestrians.initDeterministic(VC.city, VC.player);
        if (VC.pedestrians.seedShotCrowd) VC.pedestrians.seedShotCrowd(22, VC.player);
        // Keep a readable cluster of umbrella pedestrians in the road-facing frame.
        var streetPedPositions = [
          [660,640], [800,680], [640,760], [815,735],
          [710,640], [815,705], [830,690], [840,760]
        ];
        for (var spi = 0; spi < streetPedPositions.length && spi < VC.pedestrians.pedestrians.length; spi++) {
          var streetPed = VC.pedestrians.pedestrians[spi];
          streetPed.x = streetPedPositions[spi][0];
          streetPed.y = streetPedPositions[spi][1];
          streetPed.walkAxis = spi % 2 ? 'v' : 'h';
          streetPed.walkDir = spi % 3 === 0 ? -1 : 1;
          streetPed.heading = streetPed.walkDir === 1 ? 0 : Math.PI;
          streetPed.state = 'walking';
          streetPed.stateTimer = 0;
        }
        // Add deterministic umbrella/flee offsets to the existing crowd.
        for (var pi = 0; pi < VC.pedestrians.pedestrians.length; pi++) {
          var existingPed = VC.pedestrians.pedestrians[pi];
          existingPed.hasUmbrella = true;
          if (pi % 3 === 0) {
            existingPed.state = 'fleeing';
            existingPed.stateTimer = 2.5;
            existingPed.heading = pi % 2 ? Math.PI : 0;
          }
        }
      }
      if (VC.police) {
        var streetPoliceCruiser = new VC.Vehicle('interceptor', 655, 688, 0.5);
        streetPoliceCruiser.speed = 0;
        streetPoliceCruiser.vx = 0;
        streetPoliceCruiser.vy = 0;
        streetPoliceCruiser.lightsOn = true;
        streetPoliceCruiser.sirenOn = true;
        streetPoliceCruiser.isPolice = true;
        streetPoliceCruiser.pursuitLights = true;
        VC.police.cruisers.length = 0;
        VC.police.cruisers.push({
          vehicle: streetPoliceCruiser,
          shootTimer: 1.4,
          sirenPhase: 0,
          state: 'chase',
          disabled: false,
          heavy: false
        });
        var streetPoliceCruiserTwo = new VC.Vehicle('interceptor', 700, 748, -0.8);
        streetPoliceCruiserTwo.speed = 0;
        streetPoliceCruiserTwo.vx = 0;
        streetPoliceCruiserTwo.vy = 0;
        streetPoliceCruiserTwo.lightsOn = true;
        streetPoliceCruiserTwo.sirenOn = true;
        streetPoliceCruiserTwo.isPolice = true;
        streetPoliceCruiserTwo.pursuitLights = true;
        VC.police.cruisers.push({
          vehicle: streetPoliceCruiserTwo,
          shootTimer: 1.4,
          sirenPhase: Math.PI,
          state: 'chase',
          disabled: false,
          heavy: false
        });
      }
      if (VC.wanted) VC.wanted.setLevel(2, VC.player);
      VC.player.wantedLevel = 2;
      if (VC.weather) VC.weather.forceState('HEAVY_RAIN');

    // ── drive ──────────────────────────────────────────────────────────────
    } else if (shot === 'drive') {
      VC.driveShot = true;
      var driveX = 840, driveY = 723.5;
      var muscleCar = new VC.Vehicle('ronin', driveX, driveY, -Math.PI * 0.25);
      muscleCar.speed = 300;
      muscleCar.vx = 212;
      muscleCar.vy = -212;
      muscleCar.lightsOn = true;
      if (VC.addSkidmark) {
        VC.addSkidmark(720, 715, 815, 715, 0.55);
        VC.addSkidmark(720, 732, 815, 732, 0.55);
      }
      basePlayingScene(driveX, driveY, 4850, 95, 60, 1);
      VC.player.vehicle = muscleCar;
      muscleCar.driver = VC.player;
      VC.player.facing = -Math.PI * 0.25;
      VC.player.vx = 212;
      VC.player.vy = -212;
      VC.camera.snapTo(driveX - 18, driveY + 42);
      VC.camera.zoom = 2.2;
      VC.camera.leadDist = 60;
      shotCamera = { zoom: 2.2, leadDist: 60 };
      VC.Input.mouse.screenX = 640; VC.Input.mouse.screenY = 400;
      gameTime = 4.8;
      if (VC.hud) VC.hud.toast('SPEED LIMIT EXCEEDED // PATROL ALERT', 3.0);
      if (VC.weather) VC.weather.forceState('CLEAR');

      if (VC.traffic) {
        var driveFlowOne = new VC.Vehicle('kestrel', 955, 650, -Math.PI * 0.18);
        driveFlowOne.speed = 220; driveFlowOne.vx = 210; driveFlowOne.vy = -66;
        driveFlowOne.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: driveFlowOne });

        var driveFlowTwo = new VC.Vehicle('cab', 730, 770, -Math.PI * 0.08);
        driveFlowTwo.speed = 190; driveFlowTwo.vx = 188; driveFlowTwo.vy = -15;
        driveFlowTwo.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: driveFlowTwo });

        var driveFlowThree = new VC.Vehicle('sable', 1015, 760, Math.PI * 0.92);
        driveFlowThree.speed = 175; driveFlowThree.vx = -171; driveFlowThree.vy = 37;
        driveFlowThree.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: driveFlowThree });
      }

    // ── hud / end ──────────────────────────────────────────────────────────
    } else if (shot === 'hud' || shot === 'end') {
      var coastalX = 2380, coastalY = 1050;
      basePlayingScene(coastalX, coastalY, 14500, 68, 20, 3);
      VC.player.facing = -Math.PI * 0.45;
      VC.camera.snapTo(coastalX, coastalY);
      VC.Input.mouse.screenX = 640; VC.Input.mouse.screenY = 400;
      gameTime = 7.2;
      if (VC.hud) VC.hud.toast('WANTED LEVEL 3 // ALL UNITS RESPOND', 4.0);

    // ── chase (new) ────────────────────────────────────────────────────────
    } else if (shot === 'chase') {
      VC.coverSign = true;
      VC.hiddenSignText = ['SYNTH TAXI'];
      var chaseX = 1360, chaseY = 723.5;
      var chaseCar = new VC.Vehicle('kestrel', chaseX, chaseY, 0.1);
      chaseCar.speed = 240; chaseCar.vx = 240; chaseCar.lightsOn = true;
      if (VC.addSkidmark) {
        VC.addSkidmark(680, 714, 820, 714, 0.60);
        VC.addSkidmark(680, 733, 820, 733, 0.60);
      }
      basePlayingScene(chaseX, chaseY, 12800, 100, 20, 5);
      VC.player.vehicle = chaseCar;
      chaseCar.driver = VC.player;
      if (VC.wanted) VC.wanted.setLevel(5, VC.player);
      VC.player.wantedLevel = 5;
      if (VC.Missions) {
        VC.Missions.state.currentIndex = 0;
        VC.Missions.startCurrent();
      }

      // Seed two police cruisers behind the player
      if (VC.police) {
        VC.police.seedState(6, VC.player);
        // Manually position the cruisers on the same road behind
        var cr = VC.police.cruisers;
        if (cr.length >= 1) {
          cr[0].vehicle.x = chaseX - 78; cr[0].vehicle.y = chaseY + 82;
          cr[0].vehicle.heading = 0.10; cr[0].vehicle.speed = 220;
          cr[0].vehicle.health = 32;
          cr[0].sirenPhase = 0;
        }
        if (cr.length >= 2) {
          cr[1].vehicle.x = chaseX - 82; cr[1].vehicle.y = chaseY - 78;
          cr[1].vehicle.heading = -0.08; cr[1].vehicle.speed = 200;
          cr[1].sirenPhase = Math.PI;
        }
        if (cr.length >= 3) {
          cr[2].vehicle.x = chaseX + 180; cr[2].vehicle.y = chaseY - 90;
          cr[2].vehicle.heading = 0.18; cr[2].vehicle.speed = 210;
          cr[2].sirenPhase = Math.PI * 0.5;
        }
        if (cr.length >= 4) {
          cr[3].vehicle.x = chaseX - 175; cr[3].vehicle.y = chaseY - 145;
          cr[3].vehicle.heading = 0.22; cr[3].vehicle.speed = 195;
          cr[3].sirenPhase = Math.PI * 1.5;
          cr[3].disabled = false;
        }
        // Two additional fixed interceptors close in from the left rear,
        // kept clear of the player, the explosions, and all HUD regions.
        if (cr.length >= 5) {
          cr[4].vehicle.x = chaseX - 155; cr[4].vehicle.y = chaseY + 115;
          cr[4].vehicle.heading = -0.30; cr[4].vehicle.speed = 215;
          cr[4].vehicle.typeKey = 'interceptor';
          cr[4].vehicle.isPolice = true;
          cr[4].vehicle.sirenOn = true;
          cr[4].vehicle.lightsOn = true;
          cr[4].sirenPhase = Math.PI * 0.25;
        }
        if (cr.length >= 6) {
          cr[5].vehicle.x = chaseX - 310; cr[5].vehicle.y = chaseY - 85;
          cr[5].vehicle.heading = 0.32; cr[5].vehicle.speed = 205;
          cr[5].vehicle.typeKey = 'interceptor';
          cr[5].vehicle.isPolice = true;
          cr[5].vehicle.sirenOn = true;
          cr[5].vehicle.lightsOn = true;
          cr[5].sirenPhase = Math.PI * 1.25;
        }
        for (var pci = 0; pci < cr.length; pci++) {
          if (cr[pci].vehicle.typeKey === 'interceptor') {
            cr[pci].vehicle.pursuitLights = true;
          }
        }
        if (cr.length >= 3) {
          cr[2].vehicle.health = 18;
          cr[2].vehicle.damageFlash = 0.8;
          cr[2].vehicle.exploded = false;
        }
      }
      // Two normal cars to either side and one ahead turn the chase into a
      // populated traffic frame while keeping the kestrel unobstructed.
      if (VC.traffic) {
        var flowOne = new VC.Vehicle('ronin', chaseX - 155, chaseY + 78, 0.12);
        flowOne.speed = 205; flowOne.vx = 205; flowOne.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: flowOne });
        var flowTwo = new VC.Vehicle('cab', chaseX + 145, chaseY - 92, 0.08);
        flowTwo.speed = 225; flowTwo.vx = 225; flowTwo.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: flowTwo });
        var flowThree = new VC.Vehicle('hauler', chaseX + 42, chaseY + 118, 0.18);
        flowThree.speed = 188; flowThree.vx = 188; flowThree.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: flowThree });
      }
      // Fixed curb-side cover placements keep the crowd visible without
      // blocking the kestrel or scattering into the road.
      if (VC.pedestrians) {
        VC.pedestrians.MAX_PEDESTRIANS = 9;
        VC.pedestrians.initDeterministic(VC.city, VC.player);
        if (VC.pedestrians.seedShotCrowd) VC.pedestrians.seedShotCrowd(9, VC.player);
        var chaseCrowdOffsets = [
          [-119.72,49.30], [-77.46,-49.30], [84.51,49.30], [56.34,-49.30],
          [-183.10,-119.72], [-28.17,-105.63], [126.76,-112.68],
          [-169.01,126.76], [147.89,112.68]
        ];
        for (var ci = 0; ci < VC.pedestrians.pedestrians.length && ci < chaseCrowdOffsets.length; ci++) {
          var crowdPed = VC.pedestrians.pedestrians[ci];
          crowdPed.x = chaseX + chaseCrowdOffsets[ci][0];
          crowdPed.y = chaseY + chaseCrowdOffsets[ci][1];
          crowdPed.hasUmbrella = ci === 1 || ci === 3 || ci === 5 || ci === 7;
          crowdPed.umbrellaColor = ci === 1 ? '#ffcc44' : (ci === 3 ? '#00f0ff' : (ci === 5 ? '#ff4fa3' : '#ff8c42'));
          crowdPed.shirtColor = ci % 3 === 0 ? '#ffd166' : (ci % 3 === 1 ? '#00f0c8' : '#ff5d8f');
          if (ci === 2 || ci === 5) {
            crowdPed.state = 'fleeing';
            crowdPed.stateTimer = 4.0;
            crowdPed.heading = ci === 2 ? Math.PI : 0;
          } else {
            crowdPed.heading = ci % 2 ? Math.PI : 0.1;
          }
        }
      }
      // Three still-frame fireballs on a left-up to right-down diagonal.
      // No blast falls inside 120px of the player, and two are beyond 150px.
      if (VC.spawnExplosion) {
        VC.spawnExplosion(chaseX - 190, chaseY - 104, 0.78);
        VC.spawnExplosion(chaseX + 180, chaseY + 66, 0.58);
        VC.spawnExplosion(chaseX + 82, chaseY - 178, 0.68);
      } else if (VC.updateVehicleEffects) {
        VC.updateVehicleEffects(0.15);
      }
      // The blast hurts the player, and a single still frame would keep the full
      // red hit flash on screen, tinting the whole cover red.
      if (VC.combat && VC.combat.clearScreenCues) VC.combat.clearScreenCues();
      // Advance the blast a few effect steps so the fireball is caught mid-explosion.
      if (VC.updateVehicleEffects) {
        VC.updateVehicleEffects(0.15);
        VC.updateVehicleEffects(0.15);
      }
      // Start from a clean message stack; only the pursuit call belongs on the cover.
      if (VC.hud && VC.hud.clearToasts) VC.hud.clearToasts();

      VC.camera.snapTo(chaseX - 10, chaseY - 28);
      shotCamera = { zoom: 1.42, leadDist: 145 };
      VC.Input.mouse.screenX = 640; VC.Input.mouse.screenY = 400;
      gameTime = 5.5;
      if (VC.hud) VC.hud.toast('INTERCEPTOR UNIT 7 — ALL UNITS PURSUE', 4.0);
      if (VC.weather) VC.weather.forceState('STORM');
      if (VC.PoliceAir) VC.PoliceAir.seedOverhead(chaseX, chaseY, 0);

    // ── hero (cover) ─────────────────────────────────────────────────────────
    } else if (shot === 'hero') {
      VC.dusk = true;
      VC.coverSign = true;
      VC.hiddenSignText = ['SYNTH TAXI'];

      basePlayingScene(2385, 905, 2400, 100, 40, 0);
      VC.player.facing = -Math.PI * 0.5;

      VC.camera.snapTo(2600, 870);
      VC.camera.zoom = 1.62;
      shotCamera = { zoom: 1.62, leadDist: 90 };

      var heroCar = new VC.Vehicle('kestrel', 2330, 900, 0.05);
      heroCar.speed = 0;
      heroCar.lightsOn = true;

      if (VC.weather) VC.weather.forceState('CLEAR');
      gameTime = 5.2;

      if (VC.dusk && VC.traffic) {
        var heroTraffic = new VC.Vehicle('ronin', 2470, 950, 0.05);
        heroTraffic.speed = 68;
        heroTraffic.lightsOn = true;
        heroTraffic.vx = 68;
        heroTraffic.vy = 0;
        VC.traffic.vehicles.push({ vehicle: heroTraffic });
      }

      if (VC.dusk && VC.pedestrians) {
        VC.pedestrians.MAX_PEDESTRIANS = 12;
        VC.pedestrians.initDeterministic(VC.city, VC.player);
        if (VC.pedestrians.seedShotCrowd) VC.pedestrians.seedShotCrowd(4, VC.player);

        var heroPedPositions = [
          [2290,940], [2350,860], [2420,980], [2470,840]
        ];
        for (var hpi = 0; hpi < heroPedPositions.length && hpi < VC.pedestrians.pedestrians.length; hpi++) {
          var heroPed = VC.pedestrians.pedestrians[hpi];
          heroPed.x = heroPedPositions[hpi][0];
          heroPed.y = heroPedPositions[hpi][1];
          heroPed.hasUmbrella = false;
          heroPed.walkAxis = hpi % 2 ? 'v' : 'h';
          heroPed.heading = hpi % 2 ? Math.PI : 0;
          heroPed.state = 'walking';
          heroPed.stateTimer = 0;
        }
      }

      if (VC.dusk && VC.police) {
        VC.police.seedState(1, VC.player);
        if (VC.police.cruisers.length >= 1) {
          var heroCruiser = VC.police.cruisers[0];
          heroCruiser.vehicle.x = 2215;
          heroCruiser.vehicle.y = 795;
          heroCruiser.vehicle.heading = 0.12;
          heroCruiser.vehicle.speed = 0;
          heroCruiser.vehicle.typeKey = 'interceptor';
          heroCruiser.vehicle.isPolice = true;
          heroCruiser.vehicle.sirenOn = true;
          heroCruiser.vehicle.lightsOn = true;
          heroCruiser.vehicle.pursuitLights = false;
          heroCruiser.sirenPhase = NaN;
        }
      }

      if (VC.wanted) VC.wanted.setLevel(2, VC.player);
      VC.player.wantedLevel = 2;

    // ── dusk ────────────────────────────────────────────────────────────────
    } else if (shot === 'dusk') {
      VC.dusk = true;
      var duskX = 2385, duskY = 905;

      basePlayingScene(duskX, duskY, 2400, 100, 40, 0);
      VC.player.facing = -Math.PI * 0.5;

      VC.camera.snapTo(2600, 870);
      VC.camera.zoom = 1.62;
      shotCamera = { zoom: 1.62, leadDist: 90 };

      var duskCar = new VC.Vehicle('kestrel', 2330, 900, 0.05);
      duskCar.speed = 0;
      duskCar.lightsOn = true;

      if (VC.weather) VC.weather.forceState('CLEAR');
      gameTime = 5.2;

    // ── golden (dusk, clear) ───────────────────────────────────────────────
    } else if (shot === 'golden') {
      VC.dusk = true;
      var goldenX = 740, goldenY = 705;
      basePlayingScene(goldenX, goldenY, 3400, 100, 50, 2);
      VC.player.facing = -Math.PI * 0.25;

      VC.camera.snapTo(goldenX, goldenY);
      VC.camera.zoom = 2.2;
      shotCamera = { zoom: 2.2, leadDist: 70 };
      VC.Input.mouse.screenX = 720; VC.Input.mouse.screenY = 320;
      gameTime = 4.6;

      if (VC.weather) VC.weather.forceState('CLEAR');

      var nearCab = new VC.Vehicle('cab', 785, 723.5, 0);
      nearCab.speed = 0;
      nearCab.lightsOn = true;
      VC.player.nearVehicle = nearCab;

      if (VC.traffic) {
        VC.traffic.vehicles.push({ vehicle: nearCab });

        var goldenFlowOne = new VC.Vehicle('kestrel', 825, 650, -Math.PI * 0.12);
        goldenFlowOne.speed = 95;
        goldenFlowOne.vx = 93;
        goldenFlowOne.vy = -18;
        goldenFlowOne.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: goldenFlowOne });

        var goldenFlowTwo = new VC.Vehicle('cab', 640, 758, Math.PI * 0.88);
        goldenFlowTwo.speed = 118;
        goldenFlowTwo.vx = -116;
        goldenFlowTwo.vy = 35;
        goldenFlowTwo.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: goldenFlowTwo });

        var goldenFlowThree = new VC.Vehicle('sable', 870, 790, -Math.PI * 0.04);
        goldenFlowThree.speed = 72;
        goldenFlowThree.vx = 72;
        goldenFlowThree.vy = -3;
        goldenFlowThree.lightsOn = true;
        VC.traffic.vehicles.push({ vehicle: goldenFlowThree });
      }

      if (VC.pedestrians) {
        VC.pedestrians.MAX_PEDESTRIANS = 18;
        VC.pedestrians.initDeterministic(VC.city, VC.player);
        if (VC.pedestrians.seedShotCrowd) VC.pedestrians.seedShotCrowd(16, VC.player);
        var goldenPedPositions = [
          [650,625], [690,665], [620,710], [680,755],
          [770,620], [815,650], [790,680], [835,710],
          [715,790], [760,760], [610,780], [850,635],
          [890,705], [605,650], [875,755], [730,830]
        ];
        for (var gpi = 0; gpi < goldenPedPositions.length && gpi < VC.pedestrians.pedestrians.length; gpi++) {
          var goldenPed = VC.pedestrians.pedestrians[gpi];
          goldenPed.x = goldenPedPositions[gpi][0];
          goldenPed.y = goldenPedPositions[gpi][1];
          goldenPed.walkAxis = gpi % 2 ? 'v' : 'h';
          goldenPed.walkDir = gpi % 3 === 0 ? -1 : 1;
          goldenPed.heading = goldenPed.walkDir === 1 ? 0 : Math.PI;
          goldenPed.state = 'walking';
          goldenPed.stateTimer = 0;
          goldenPed.hasUmbrella = false;
        }
      }

      if (VC.police) {
        var goldenPoliceCruiser = new VC.Vehicle('interceptor', 655, 688, 0.5);
        goldenPoliceCruiser.speed = 0;
        goldenPoliceCruiser.vx = 0;
        goldenPoliceCruiser.vy = 0;
        goldenPoliceCruiser.lightsOn = true;
        goldenPoliceCruiser.sirenOn = true;
        goldenPoliceCruiser.isPolice = true;
        goldenPoliceCruiser.pursuitLights = false;
        VC.police.cruisers.length = 0;
        VC.police.cruisers.push({
          vehicle: goldenPoliceCruiser,
          shootTimer: 1.4,
          sirenPhase: 0,
          state: 'chase',
          disabled: false,
          heavy: false
        });
      }

      if (VC.wanted) VC.wanted.setLevel(2, VC.player);
      VC.player.wantedLevel = 2;

    // ── mission (new) ──────────────────────────────────────────────────────
    } else if (shot === 'mission') {
      var missionX = 740, missionY = 705;
      basePlayingScene(missionX, missionY, 1800, 100, 50, 0);
      VC.player.facing = Math.PI * 0.1;
      VC.camera.snapTo(missionX, missionY);
      VC.Input.mouse.screenX = 640; VC.Input.mouse.screenY = 400;
      gameTime = 3.0;

      // Open the first mission briefing dialog
      if (VC.Missions) {
        VC.Missions.startCurrent();
        // Keep dialog open for the shot
        if (VC.Missions.state.dialog) {
          VC.Missions.state.dialog.timer = 6.5; // reset to full
        }
      }
      if (VC.weather) VC.weather.forceState('LIGHT_RAIN');
    }

    // Force one deterministic update step and camera settle
    VC.camera.update(0.016, VC.player.vehicle || VC.player);
    if (VC.player) VC.player.update(0, VC.city);
    // Restore chase state after the one settle step, so the frame the shot renders shows the car at speed.
    if (shotType === 'chase' && VC.player && VC.player.vehicle) {
      var chaseTailCar = VC.player.vehicle;
      chaseTailCar.speed = 240;
      chaseTailCar.vx = 240;
      chaseTailCar.vy = 0;
      chaseTailCar.heading = 0.1;
      chaseTailCar.health = chaseTailCar.maxHealth;
      chaseTailCar.damageFlash = 0;
      chaseTailCar.lightsOn = true;
      VC.player.health = VC.player.maxHealth;
      VC.player.vx = 240;
      VC.player.vy = 0;
      VC.player.facing = 0.1;
    }
    if (shotType === 'drive' && VC.player && VC.player.vehicle) {
      var driveCar = VC.player.vehicle;
      driveCar.speed = 300;
      driveCar.vx = 212;
      driveCar.vy = -212;
      driveCar.heading = -Math.PI * 0.25;
      driveCar.health = driveCar.maxHealth;
      driveCar.damageFlash = 0;
      driveCar.lightsOn = true;
      VC.player.health = VC.player.maxHealth;
      VC.player.vx = 212;
      VC.player.vy = -212;
      VC.player.facing = -Math.PI * 0.25;
    }
    // Restore the requested camera only after the settle update has run,
    // since Player.update resets zoom and lead distance for vehicle/on-foot branches.
    if (shotCamera) {
      VC.camera.zoom = shotCamera.zoom;
      VC.camera.leadDist = shotCamera.leadDist;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    if (!ctx) return;

    if (VC.gameState === 'title') {
      VC.Renderer.render(ctx, VC.city, null, VC.camera, gameTime);
      VC.Menu.render(ctx, gameTime);

    } else if (VC.gameState === 'playing') {
      // Keep the shot-only street interceptor flashing even with wanted level 0.
      if ((shotType === 'street' || shotType === 'golden') && VC.police && VC.police.cruisers) {
        for (var sci = 0; sci < VC.police.cruisers.length; sci++) {
          var streetCruiser = VC.police.cruisers[sci];
          if (streetCruiser && streetCruiser.vehicle) {
            streetCruiser.vehicle.sirenTimer = gameTime * 8;
            streetCruiser.sirenPhase = (gameTime * 2.4 * Math.PI * 2) % (Math.PI * 2);
          }
        }
      }
      VC.Renderer.render(ctx, VC.city, VC.player, VC.camera, gameTime);

      // Shot-only street halo: keep the on-foot protagonist readable over dark rain-slick roads.
      if ((shotType === 'street' || shotType === 'chase') && VC.player) {
        var outlineX = 640 + (VC.player.x - VC.camera.x) * VC.camera.zoom;
        var outlineY = 400 + (VC.player.y - VC.camera.y) * VC.camera.zoom;
        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.strokeStyle = 'rgba(205,250,255,0.96)';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#7deaff';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        var pursuitRadius = shotType === 'chase' ? 38 : 12;
        ctx.arc(outlineX, outlineY, pursuitRadius * VC.camera.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Shot-only firefight hero rim: a warm, broken arc separates the
      // protagonist from the cyan aiming reticle already on the ground.
      if (shotType === 'firefight' && VC.player) {
        var heroX = 640 + (VC.player.x - VC.camera.x) * VC.camera.zoom;
        var heroY = 400 + (VC.player.y - VC.camera.y) * VC.camera.zoom;
        var heroRadius = 18 * VC.camera.zoom;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,174,68,0.96)';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ff9d38';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(heroX, heroY, heroRadius, 0.18, 1.42);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(heroX, heroY, heroRadius, 1.72, 2.96);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(heroX, heroY, heroRadius, 3.28, 4.52);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(heroX, heroY, heroRadius, 4.82, 6.06);
        ctx.stroke();
        ctx.restore();
      }

      // Shot-only chase mission beacon: bright forward-side objective marker,
      // drawn in world-to-screen space so it remains level with the player.
      if (shotType === 'chase') {
        var markerWorldX = 1580;
        var markerWorldY = 610;
        var markerX = 640 + (markerWorldX - VC.camera.x) * VC.camera.zoom;
        var markerY = 400 + (markerWorldY - VC.camera.y) * VC.camera.zoom;
        var markerPulse = 1 + 0.12 * Math.sin(gameTime * 3.5);
        ctx.save();
        ctx.translate(markerX, markerY);
        ctx.strokeStyle = 'rgba(255,196,40,0.72)';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffd24a';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(0, 0, 17 * markerPulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffe66a';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,210,74,0.92)';
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(-5, 2);
        ctx.lineTo(-1.5, 2);
        ctx.lineTo(-1.5, 8);
        ctx.lineTo(1.5, 8);
        ctx.lineTo(1.5, 2);
        ctx.lineTo(5, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Shot-only firefight downed runner: a high-contrast world-space blood pool
      // and spread-eagle limbs keep the casualty visible beside the open road.
      if (shotType === 'firefight') {
        var downX = 992;
        var downY = 781;
        var screenDownX = 640 + (downX - VC.camera.x) * VC.camera.zoom;
        var screenDownY = 400 + (downY - VC.camera.y) * VC.camera.zoom;
        ctx.save();
        ctx.translate(screenDownX, screenDownY);
        ctx.rotate(-0.35);
        ctx.fillStyle = 'rgba(18,7,12,0.92)';
        ctx.beginPath();
        ctx.ellipse(0, 7, 38, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(92,8,24,0.92)';
        ctx.beginPath();
        ctx.ellipse(-5, 5, 29, 10, 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#263238';
        ctx.beginPath();
        ctx.moveTo(-8, -9);
        ctx.lineTo(9, -9);
        ctx.lineTo(28, -24);
        ctx.lineTo(34, -18);
        ctx.lineTo(12, -2);
        ctx.lineTo(18, 18);
        ctx.lineTo(11, 21);
        ctx.lineTo(-2, 5);
        ctx.lineTo(-15, 21);
        ctx.lineTo(-22, 17);
        ctx.lineTo(-12, -2);
        ctx.lineTo(-34, -16);
        ctx.lineTo(-29, -23);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#d7a06f';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, -2);
        ctx.lineTo(-34, -16);
        ctx.moveTo(10, -2);
        ctx.lineTo(34, -18);
        ctx.moveTo(-8, 3);
        ctx.lineTo(-22, 17);
        ctx.moveTo(10, 3);
        ctx.lineTo(18, 18);
        ctx.stroke();
        ctx.fillStyle = '#b61f48';
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Screen-space combat effects (busted, hit flash, vignette)
      if (VC.combat) VC.combat.renderScreenEffects(ctx, VC.player, gameTime);

      VC.hud.render(ctx, VC.player, VC.city, gameTime);

    } else if (VC.gameState === 'paused') {
      VC.Renderer.render(ctx, VC.city, VC.player, VC.camera, gameTime);
      if (VC.combat) VC.combat.renderScreenEffects(ctx, VC.player, gameTime);
      VC.hud.render(ctx, VC.player, VC.city, gameTime);

      ctx.fillStyle = 'rgba(2,6,12,0.75)'; ctx.fillRect(0, 0, 1280, 800);
      VC.drawGlowText(ctx, 'GAME PAUSED', 640, 340,
        'bold 36px "Courier New", monospace', '#00f0ff', 'rgba(0,240,255,0.8)', 14, 'center');
      ctx.font = '16px "Courier New", monospace'; ctx.fillStyle = '#d0deee';
      ctx.textAlign = 'center';
      ctx.fillText('[ Press ESC or ENTER to Resume ]', 640, 420);
      ctx.fillText('[ F5 Save  |  F9 Load  |  G: Next Mission ]', 640, 460);
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────
  function update(dt) {
    gameTime += dt;
    if (VC.weather) VC.weather.update(dt, VC.city, VC.player, gameTime);
    if (VC.Audio && VC.weather) VC.Audio.setRainIntensity(VC.weather.rainIntensity);
    if (VC.Audio && VC.player) VC.Audio.setHeartbeat(VC.player.health < 30);

    // ── Global binds ──────────────────────────────────────────────────────
    if (VC.Input.justPressed('Escape')) {
      if (VC.gameState === 'playing') {
        VC.gameState = 'paused';
        if (VC.Audio) VC.Audio.uiBlip(600);
      } else if (VC.gameState === 'paused') {
        VC.gameState = 'playing';
        if (VC.Audio) VC.Audio.uiBlip(900);
      }
    }

    // F5 save / F9 load
    if (VC.Input.justPressed('F5') && VC.gameState === 'playing') {
      if (VC.Save) VC.Save.save(VC.player);
      else if (VC.Menu) VC.Menu.saveGame(VC.player);
    }
    if (VC.Input.justPressed('F9') && VC.gameState === 'playing') {
      if (VC.Save) VC.Save.load(VC.player);
      else if (VC.Menu) VC.Menu.loadGame(VC.player);
    }

    // R — reload weapon
    if (VC.Input.actionPressed('reload') && VC.gameState === 'playing' && !VC.player.vehicle) {
      if (VC.Weapons) VC.Weapons.startReload();
    }

    // Q — cycle weapon
    if (VC.Input.actionPressed('cycle') && VC.gameState === 'playing' && !VC.player.vehicle) {
      if (VC.Weapons) VC.Weapons.cycleWeapon();
    }

    // E — pick up weapon crate
    if (VC.Input.actionPressed('pickup') && VC.gameState === 'playing' && !VC.player.vehicle) {
      if (VC.Weapons) VC.Weapons.pickupNearby(VC.player);
    }

    // Space — skip mission dialog
    if (VC.Input.justPressed('Space') && VC.gameState === 'playing') {
      if (VC.Missions && VC.Missions.state.dialog) {
        VC.Missions.closeBriefingDialog();
      }
    }

    // G — start current mission (dev shortcut / paused menu hint)
    if (VC.Input.justPressed('KeyG') && VC.gameState === 'playing') {
      if (VC.Missions && !VC.Missions.state.active) {
        VC.Missions.startCurrent();
      }
    }

    // Music toggle
    if (VC.Input.justPressed('Comma')) {
      if (VC.Audio) {
        var on = VC.Audio.toggleMusic();
        if (VC.hud) VC.hud.toast('SYNTH MUSIC: ' + (on ? 'ON' : 'OFF'), 1.5);
      }
    }

    // ── State machine ─────────────────────────────────────────────────────
    if (VC.gameState === 'title') {
      VC.Menu.update(dt);
      VC.camera.x += Math.cos(gameTime * 0.15) * 18 * dt;
      VC.camera.y += Math.sin(gameTime * 0.12) * 14 * dt;
      VC.camera.clamp();

    } else if (VC.gameState === 'playing') {
      // Skip most physics while busted
      if (VC.combat && VC.combat.isBusted()) {
        VC.combat.update(dt, VC.player);
        VC.hud.update(dt, VC.player);
        return;
      }

      if (VC.traffic)     VC.traffic.update(dt, VC.city, VC.player, gameTime);
      if (VC.pedestrians) VC.pedestrians.update(dt, VC.city, VC.player, VC.traffic ? VC.traffic.vehicles : null);
      if (VC.minimap)     VC.minimap.update(dt);

      // Weapon fire (LMB)
      if (VC.Input.mouse && VC.Input.mouse.down && !VC.player.vehicle && VC.Weapons) {
        var cam = VC.camera;
        var mx = VC.Input.mouse.screenX;
        var my = VC.Input.mouse.screenY;
        // Convert screen → world
        var worldX = cam.x + (mx - 640) / cam.zoom;
        var worldY = cam.y + (my - 400) / cam.zoom;
        VC.player.facing = Math.atan2(worldY - VC.player.y, worldX - VC.player.x);
        VC.Weapons.fire(VC.player, worldX, worldY);
      }

      if (VC.Weapons) VC.Weapons.update(dt);
      if (VC.Weapons && VC.Weapons.state.current === 'longshot' && VC.Input.mouse.rightDown) {
        VC.Weapons.state.aiming = true;
        if (VC.camera) VC.camera.sniperZoom(1);
      } else if (VC.camera && !VC.player.vehicle) {
        if (VC.Weapons) VC.Weapons.state.aiming = false;
        VC.camera.sniperZoom(0);
      }
      if (VC.wanted)  VC.wanted.update(dt);
      if (VC.police)  VC.police.update(dt, VC.player, gameTime);
      if (VC.PoliceAir) VC.PoliceAir.update(dt, VC.player, VC.city, gameTime);
      if (VC.updateVehicleEffects) VC.updateVehicleEffects(dt);
      if (VC.Missions) VC.Missions.update(dt, VC.player);
      if (VC.combat)  VC.combat.update(dt, VC.player);

      VC.player.update(dt, VC.city);
      VC.camera.update(dt, VC.player.vehicle || VC.player);
      if (VC.camera) {
        var cameraSpeed = VC.player.vehicle ? Math.abs(VC.player.vehicle.speed) / VC.player.vehicle.maxSpeed : 0;
        VC.camera.updateEffects(dt, cameraSpeed);
      }
      VC.hud.update(dt, VC.player);

    } else if (VC.gameState === 'paused') {
      if (VC.Input.justPressed('Enter') || VC.Input.justPressed('Space')) {
        VC.gameState = 'playing';
      }
    }

    VC.Input.update();
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  function loop(now) {
    var elapsed = (now - lastTimestamp) / 1000;
    lastTimestamp = now;
    if (elapsed > MAX_ACCUM) elapsed = MAX_ACCUM;
    accumulator += elapsed;

    while (accumulator >= FIXED_STEP) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    render();
    if (!isShotMode) requestAnimationFrame(loop);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var params = parseQueryParams();
    var shot = params.shot;
    var seed = params.seed;

    // Core systems
    VC.camera.init(1280, 800);
    if (VC.Input)  VC.Input.init(canvas);
    if (VC.Audio)  VC.Audio.init();
    if (VC.weather) VC.weather.init(seed ? parseInt(seed, 10) || 1986 : 1986);
    if (VC.Menu)   VC.Menu.init();

    // Seed check for "Continue" (save.js may already set hasSave)
    if (VC.Save && VC.Menu) {
      VC.Menu.hasSave = VC.Save.exists();
    }

    // Shot mode
    if (shot && ['title','start','street','play','drive','hud','end','chase','mission','firefight','dusk','hero','golden'].indexOf(shot) !== -1) {
      setupDeterministicShot(shot, seed);
      render();
      return;
    }

    // Normal play init
    var initialSeed = seed ? parseInt(seed, 10) : 1986;
    if (isNaN(initialSeed)) initialSeed = 1986;

    VC.RNG = new VC.Mulberry32(initialSeed);
    VC.city = VC.City.generate(initialSeed);
    if (VC.RNG && VC.RNG.setSeed) VC.RNG.setSeed(initialSeed);
    if (VC.Weapons) VC.Weapons.syncWeaponCrateBoxes(VC.city);
    VC.camera.setBounds(0, 0, VC.city.worldWidth, VC.city.worldHeight);

    var startX = 740, startY = 705;
    VC.player = new VC.Player(startX, startY);
    if (VC.wanted) VC.wanted.setLevel(0, VC.player);
    if (VC.Weapons) VC.Weapons.equip('fists');

    VC.camera.snapTo(startX, startY);
    if (VC.traffic)     VC.traffic.init();
    if (VC.pedestrians) VC.pedestrians.init();

    VC.gameState = 'title';

    if (VC.hud) VC.hud.toast('WELCOME TO VIREO CITY', 3.5);

    lastTimestamp = performance.now();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  VC.init = init;
  VC.update = update;
  VC.render = render;
})();
