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
    if (VC.wanted) VC.wanted.setLevel(wanted || 0, VC.player);
    if (VC.traffic)     VC.traffic.initDeterministic(VC.city, VC.player);
    if (VC.pedestrians) VC.pedestrians.initDeterministic(VC.city, VC.player);
  }

  function setupDeterministicShot(shot, seed) {
    isShotMode = true;
    shotType = shot;

    var actualSeed = seed ? parseInt(seed, 10) : 1986;
    if (isNaN(actualSeed)) actualSeed = 1986;

    VC.RNG = new VC.Mulberry32(actualSeed);
    VC.city = VC.City.generate(actualSeed);
    VC.camera.setBounds(0, 0, VC.city.worldWidth, VC.city.worldHeight);

    // ── title ──────────────────────────────────────────────────────────────
    if (shot === 'title' || shot === 'start') {
      VC.gameState = 'title';
      VC.Menu.state = 'title';
      VC.player = new VC.Player(1100, 1100);
      VC.camera.snapTo(1100, 1100);
      gameTime = 1.8;
      if (VC.weather) VC.weather.forceState('LIGHT_RAIN');

    // ── street ─────────────────────────────────────────────────────────────
    } else if (shot === 'street' || shot === 'play') {
      var spawnX = 740, spawnY = 705;
      basePlayingScene(spawnX, spawnY, 250, 100, 50, 0);
      VC.player.facing = -Math.PI * 0.25;

      var nearCab = new VC.Vehicle('cab', 785, 723.5, 0);
      nearCab.speed = 0; nearCab.lightsOn = true;
      VC.player.nearVehicle = nearCab;
      if (VC.traffic) VC.traffic.vehicles.push({ vehicle: nearCab });

      VC.camera.snapTo(spawnX, spawnY);
      VC.Input.mouse.screenX = 720; VC.Input.mouse.screenY = 320;
      gameTime = 3.5;
      if (VC.weather) VC.weather.forceState('HEAVY_RAIN');

    // ── drive ──────────────────────────────────────────────────────────────
    } else if (shot === 'drive') {
      var driveX = 840, driveY = 723.5;
      var muscleCar = new VC.Vehicle('ronin', driveX, driveY, 0);
      muscleCar.speed = 195; muscleCar.vx = 195; muscleCar.vy = 0;
      muscleCar.lightsOn = true;
      if (VC.addSkidmark) {
        VC.addSkidmark(720, 715, 815, 715, 0.55);
        VC.addSkidmark(720, 732, 815, 732, 0.55);
      }
      basePlayingScene(driveX, driveY, 4850, 95, 60, 1);
      VC.player.vehicle = muscleCar;
      muscleCar.driver = VC.player;
      VC.camera.snapTo(driveX + 90, driveY);
      VC.camera.zoom = 1.12; VC.camera.leadDist = 150;
      VC.Input.mouse.screenX = 640; VC.Input.mouse.screenY = 400;
      gameTime = 4.8;
      if (VC.hud) VC.hud.toast('SPEED LIMIT EXCEEDED // PATROL ALERT', 3.0);

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
      var chaseX = 840, chaseY = 723.5;
      var chaseCar = new VC.Vehicle('kestrel', chaseX, chaseY, 0.1);
      chaseCar.speed = 240; chaseCar.vx = 240; chaseCar.lightsOn = true;
      if (VC.addSkidmark) {
        VC.addSkidmark(680, 714, 820, 714, 0.60);
        VC.addSkidmark(680, 733, 820, 733, 0.60);
      }
      basePlayingScene(chaseX, chaseY, 7200, 55, 20, 3);
      VC.player.vehicle = chaseCar;
      chaseCar.driver = VC.player;
      if (VC.wanted) VC.wanted.setLevel(3, VC.player);
      VC.player.wantedLevel = 3;

      // Seed two police cruisers behind the player
      if (VC.police) {
        VC.police.seedState(2, VC.player);
        // Manually position the cruisers on the same road behind
        var cr = VC.police.cruisers;
        if (cr.length >= 1) {
          cr[0].vehicle.x = chaseX - 140; cr[0].vehicle.y = chaseY + 12;
          cr[0].vehicle.heading = 0; cr[0].vehicle.speed = 220;
          cr[0].sirenPhase = 0;
        }
        if (cr.length >= 2) {
          cr[1].vehicle.x = chaseX - 220; cr[1].vehicle.y = chaseY - 15;
          cr[1].vehicle.heading = 0.08; cr[1].vehicle.speed = 200;
          cr[1].sirenPhase = Math.PI;
        }
      }

      VC.camera.snapTo(chaseX + 80, chaseY);
      VC.camera.zoom = 1.15; VC.camera.leadDist = 160;
      VC.Input.mouse.screenX = 640; VC.Input.mouse.screenY = 400;
      gameTime = 5.5;
      if (VC.hud) VC.hud.toast('INTERCEPTOR UNIT 7 — ALL UNITS PURSUE', 4.0);
      if (VC.weather) VC.weather.forceState('STORM');

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
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    if (!ctx) return;

    if (VC.gameState === 'title') {
      VC.Renderer.render(ctx, VC.city, null, VC.camera, gameTime);
      VC.Menu.render(ctx, gameTime);

    } else if (VC.gameState === 'playing') {
      VC.Renderer.render(ctx, VC.city, VC.player, VC.camera, gameTime);

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
    if (VC.Input.justPressed('KeyR') && VC.gameState === 'playing' && !VC.player.vehicle) {
      if (VC.Weapons) VC.Weapons.startReload();
    }

    // Q — cycle weapon
    if (VC.Input.justPressed('KeyQ') && VC.gameState === 'playing' && !VC.player.vehicle) {
      if (VC.Weapons) VC.Weapons.cycleWeapon();
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
      if (VC.wanted)  VC.wanted.update(dt);
      if (VC.police)  VC.police.update(dt, VC.player, gameTime);
      if (VC.Missions) VC.Missions.update(dt, VC.player);
      if (VC.combat)  VC.combat.update(dt, VC.player);

      VC.player.update(dt, VC.city);
      VC.camera.update(dt, VC.player.vehicle || VC.player);
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
    if (shot && ['title','start','street','play','drive','hud','end','chase','mission'].indexOf(shot) !== -1) {
      setupDeterministicShot(shot, seed);
      render();
      return;
    }

    // Normal play init
    var initialSeed = seed ? parseInt(seed, 10) : 1986;
    if (isNaN(initialSeed)) initialSeed = 1986;

    VC.RNG = new VC.Mulberry32(initialSeed);
    VC.city = VC.City.generate(initialSeed);
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
