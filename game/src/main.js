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

  function setupDeterministicShot(shot, seed) {
    isShotMode = true;
    shotType = shot;

    var actualSeed = seed ? parseInt(seed, 10) : 1986;
    if (isNaN(actualSeed)) actualSeed = 1986;

    VC.RNG = new VC.Mulberry32(actualSeed);
    VC.city = VC.City.generate(actualSeed);
    VC.camera.setBounds(0, 0, VC.city.worldWidth, VC.city.worldHeight);

    if (shot === 'title' || shot === 'start') {
      VC.gameState = 'title';
      VC.Menu.state = 'title';
      VC.player = new VC.Player(1100, 1100);
      VC.camera.snapTo(1100, 1100);
      gameTime = 1.8;
    } else if (shot === 'street' || shot === 'play') {
      VC.gameState = 'playing';
      // Place player at an intersection near neon signs & palm trees
      var spawnX = 740;
      var spawnY = 705;
      VC.player = new VC.Player(spawnX, spawnY);
      VC.player.facing = -Math.PI * 0.25;
      VC.player.cash = 250;
      VC.player.health = 100;
      VC.player.armor = 50;
      VC.player.wantedLevel = 0;
      VC.camera.snapTo(spawnX, spawnY);
      VC.Input.mouse.screenX = 720;
      VC.Input.mouse.screenY = 320;
      gameTime = 3.5;
    } else if (shot === 'hud' || shot === 'end') {
      VC.gameState = 'playing';
      // Dramatic coastal avenue corner with wanted level and toast
      var coastalX = 2380;
      var coastalY = 1050;
      VC.player = new VC.Player(coastalX, coastalY);
      VC.player.facing = -Math.PI * 0.45;
      VC.player.cash = 14500;
      VC.player.health = 68;
      VC.player.armor = 20;
      VC.player.wantedLevel = 3;
      VC.camera.snapTo(coastalX, coastalY);
      VC.Input.mouse.screenX = 640;
      VC.Input.mouse.screenY = 400;
      gameTime = 7.2;
      VC.hud.toast('WANTED LEVEL 3 // ALL UNITS RESPOND', 4.0);
    }

    // Force one deterministic physics / camera update step
    VC.camera.update(0.016, VC.player);
    if (VC.hud) VC.hud.update(0.016);
  }

  function init() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) {
      console.error('Canvas element #game-canvas not found.');
      return;
    }
    ctx = canvas.getContext('2d');

    // Default logical resolution
    canvas.width = 1280;
    canvas.height = 800;

    // Initialize systems
    VC.Input.init(canvas);
    VC.Menu.init();

    var params = parseQueryParams();
    var shot = params.shot;
    var seed = params.seed;

    if (shot && (shot === 'title' || shot === 'start' ||
                 shot === 'street' || shot === 'play' ||
                 shot === 'hud' || shot === 'end')) {
      setupDeterministicShot(shot, seed);
      // Immediately draw exact single frame for screenshot tooling
      render();
      return;
    }

    // Normal play initialization
    var initialSeed = seed ? parseInt(seed, 10) : 1986;
    if (isNaN(initialSeed)) initialSeed = 1986;

    VC.RNG = new VC.Mulberry32(initialSeed);
    VC.city = VC.City.generate(initialSeed);
    VC.camera.setBounds(0, 0, VC.city.worldWidth, VC.city.worldHeight);

    // Initial player position in central boulevard
    var startX = 740;
    var startY = 705;
    VC.player = new VC.Player(startX, startY);
    VC.camera.snapTo(startX, startY);

    VC.gameState = 'title'; // 'title', 'playing', 'paused'

    // Initial toast notification
    VC.hud.toast('WELCOME TO VIREO CITY', 3.5);

    // Kick off animation loop
    lastTimestamp = performance.now();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    gameTime += dt;

    // Global Key Binds
    if (VC.Input.justPressed('Escape')) {
      if (VC.gameState === 'playing') {
        VC.gameState = 'paused';
        if (VC.Audio) VC.Audio.uiBlip(600);
      } else if (VC.gameState === 'paused') {
        VC.gameState = 'playing';
        if (VC.Audio) VC.Audio.uiBlip(900);
      }
    }

    // Quick Save (F5) & Quick Load (F9)
    if (VC.Input.justPressed('F5') && VC.gameState === 'playing') {
      VC.Menu.saveGame(VC.player);
    }
    if (VC.Input.justPressed('F9') && VC.gameState === 'playing') {
      VC.Menu.loadGame(VC.player);
    }

    // Toggle Synth Music (Comma)
    if (VC.Input.justPressed('Comma')) {
      if (VC.Audio) {
        var on = VC.Audio.toggleMusic();
        if (VC.hud) VC.hud.toast('SYNTH MUSIC: ' + (on ? 'ON' : 'OFF'), 1.5);
      }
    }

    // State machine updates
    if (VC.gameState === 'title') {
      VC.Menu.update(dt);
      // Slowly pan camera across city in title screen background
      VC.camera.x += Math.cos(gameTime * 0.15) * 18 * dt;
      VC.camera.y += Math.sin(gameTime * 0.12) * 14 * dt;
      VC.camera.clamp();
    } else if (VC.gameState === 'playing') {
      VC.player.update(dt, VC.city);
      VC.camera.update(dt, VC.player);
      VC.hud.update(dt);
    } else if (VC.gameState === 'paused') {
      // Game paused, do not update player physics
      if (VC.Input.justPressed('Enter') || VC.Input.justPressed('Space')) {
        VC.gameState = 'playing';
      }
    }

    VC.Input.update();
  }

  function render() {
    if (!ctx) return;

    if (VC.gameState === 'title') {
      // Draw ambient city behind menu
      VC.Renderer.render(ctx, VC.city, null, VC.camera, gameTime);
      VC.Menu.render(ctx, gameTime);
    } else if (VC.gameState === 'playing') {
      VC.Renderer.render(ctx, VC.city, VC.player, VC.camera, gameTime);
      VC.hud.render(ctx, VC.player, VC.city, gameTime);
    } else if (VC.gameState === 'paused') {
      VC.Renderer.render(ctx, VC.city, VC.player, VC.camera, gameTime);
      VC.hud.render(ctx, VC.player, VC.city, gameTime);

      // Dim overlay
      ctx.fillStyle = 'rgba(2, 6, 12, 0.75)';
      ctx.fillRect(0, 0, 1280, 800);

      VC.drawGlowText(
        ctx,
        'GAME PAUSED',
        640,
        340,
        'bold 36px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.8)',
        14,
        'center'
      );

      ctx.font = '16px "Courier New", monospace';
      ctx.fillStyle = '#d0deee';
      ctx.textAlign = 'center';
      ctx.fillText('[ Press ESC or ENTER to Resume ]', 640, 420);
      ctx.fillText('[ Press F5 to Save | F9 to Load ]', 640, 460);
    }
  }

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

    if (!isShotMode) {
      requestAnimationFrame(loop);
    }
  }

  // Auto initialize on DOMContentLoaded or window load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  VC.init = init;
  VC.update = update;
  VC.render = render;
})();
