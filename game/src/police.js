// Police AI: cruisers, foot officers, sirens, chasing, ramming, jackable cruisers
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var INTERCEPT_SPEED   = 290;
  var RAM_SPEED         = 320;
  var SIGHT_RANGE       = 420;    // pixels
  var SHOOT_RANGE       = 220;
  var FOOT_SHOOT_RANGE  = 180;
  var SHOOT_INTERVAL    = 1.4;    // seconds between officer shots
  var SIREN_FLICKER_HZ  = 2.4;    // times per second for the siren flash
  var MAX_CRUISERS      = 4;
  var SPAWN_DIST        = 650;    // spawn outside this range from player
  var DESPAWN_DIST      = 1200;

  // Foot officer spawns at 3+ stars
  var MAX_FOOT_OFFICERS = 3;

  // ── State ──────────────────────────────────────────────────────────────────
  var cruisers = [];        // { vehicle: VC.Vehicle, ai: {...}, shootTimer: 0, sirenPhase: 0 }
  var footOfficers = [];    // { x, y, vx, vy, shootTimer, dead }
  var spawnTimer = 0;
  var footSpawnTimer = 0;
  var active = false;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function spawnCruiser(player) {
    if (!VC.city || !player) return;
    // Spawn on a road segment near the player but outside sight
    var angle = Math.random() * Math.PI * 2;
    var dist  = SPAWN_DIST + Math.random() * 200;
    var sx = player.x + Math.cos(angle) * dist;
    var sy = player.y + Math.sin(angle) * dist;
    // Clamp to world
    sx = Math.max(50, Math.min(VC.city.worldWidth - 50, sx));
    sy = Math.max(50, Math.min(VC.city.worldHeight - 50, sy));

    var v = new VC.Vehicle('interceptor', sx, sy, angle);
    v.speed = 0;
    v.lightsOn = true;
    // Mark this as a police car (affects wanted crime if rammed)
    v.isPolice = true;

    cruisers.push({
      vehicle: v,
      shootTimer: SHOOT_INTERVAL,
      sirenPhase: Math.random() * Math.PI * 2,
      state: 'chase',   // 'chase' | 'ram' | 'disabled'
      disabled: false
    });
  }

  function spawnFootOfficer(player) {
    if (!player) return;
    var angle = Math.random() * Math.PI * 2;
    var dist  = 160 + Math.random() * 120;
    footOfficers.push({
      x: player.x + Math.cos(angle) * dist,
      y: player.y + Math.sin(angle) * dist,
      vx: 0, vy: 0,
      shootTimer: SHOOT_INTERVAL * (0.8 + Math.random() * 0.4),
      dead: false,
      health: 40
    });
  }

  // Simple steering toward target
  function steerToward(cruiserEntry, tx, ty, dt) {
    var v = cruiserEntry.vehicle;
    var dx = tx - v.x;
    var dy = ty - v.y;
    var targetHeading = Math.atan2(dy, dx);
    var angleDiff = targetHeading - v.heading;
    // Normalize
    while (angleDiff >  Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    var turn = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), v.type.turnSpeed * dt);
    v.heading += turn;

    var wanted = VC.wanted ? VC.wanted.level : 0;
    var targetSpeed = wanted >= 4 ? RAM_SPEED : INTERCEPT_SPEED;
    // Slow down when close
    var dist = Math.hypot(dx, dy);
    if (dist < 80) targetSpeed *= 0.5;

    v.speed += (targetSpeed - v.speed) * Math.min(1, dt * 2.5);
    v.vx = Math.cos(v.heading) * v.speed;
    v.vy = Math.sin(v.heading) * v.speed;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
  }

  // ── Police API ─────────────────────────────────────────────────────────────
  var Police = {
    cruisers: cruisers,
    footOfficers: footOfficers,

    onWantedLevelChange: function(level) {
      active = level > 0;
      if (level === 0) {
        // All units stand down
        cruisers.length = 0;
        footOfficers.length = 0;
        spawnTimer = 0;
        footSpawnTimer = 0;
      }
    },

    // Allow shot/punch modes to seed a known state
    seedState: function(numCruisers, player) {
      cruisers.length = 0;
      footOfficers.length = 0;
      active = true;
      for (var i = 0; i < numCruisers; i++) {
        spawnCruiser(player);
      }
    },

    update: function(dt, player, gameTime) {
      if (!player || !active) return;

      var wanted = VC.wanted ? VC.wanted.level : (player.wantedLevel || 0);

      // ── Spawn cruisers ──────────────────────────────────────────────────────
      spawnTimer -= dt;
      if (spawnTimer <= 0 && cruisers.length < MAX_CRUISERS && wanted >= 1) {
        spawnCruiser(player);
        spawnTimer = 8 + (5 - wanted) * 2; // faster spawns at higher wanted
      }

      // ── Spawn foot officers (3+ stars) ──────────────────────────────────────
      footSpawnTimer -= dt;
      if (footSpawnTimer <= 0 && wanted >= 3 && footOfficers.length < MAX_FOOT_OFFICERS) {
        spawnFootOfficer(player);
        footSpawnTimer = 10 + Math.random() * 6;
      }

      // ── Update cruisers ─────────────────────────────────────────────────────
      var i;
      for (i = cruisers.length - 1; i >= 0; i--) {
        var c = cruisers[i];
        var v = c.vehicle;

        // Despawn if too far away
        var dToPl = Math.hypot(player.x - v.x, player.y - v.y);
        if (dToPl > DESPAWN_DIST) {
          cruisers.splice(i, 1);
          continue;
        }

        // If the player has jacked this car, skip AI
        if (v.driver === player) continue;

        // Police see the player → reset decay
        if (dToPl < SIGHT_RANGE && VC.wanted) {
          VC.wanted.registerPoliceSpot();
        }

        // ── Chase / ram ──
        if (!c.disabled) {
          var tx = player.x;
          var ty = player.y;
          if (player.vehicle) {
            // Try to cut off ahead
            var lead = 80;
            tx += Math.cos(player.facing) * lead;
            ty += Math.sin(player.facing) * lead;
          }
          steerToward(c, tx, ty, dt);
        }

        // ── Shooting (1+ stars, in range) ──
        if (!c.disabled && dToPl < SHOOT_RANGE && wanted >= 2) {
          c.shootTimer -= dt;
          if (c.shootTimer <= 0) {
            c.shootTimer = SHOOT_INTERVAL;
            if (VC.combat) {
              VC.combat.applyDamage(player, 8 + Math.random() * 6, v.x, v.y);
            } else {
              player.damage(8);
            }
            if (VC.Audio) VC.Audio.gunshot();
          }
        }

        // ── Ram collision ──
        if (!c.disabled) {
          var ramDist = Math.hypot(player.x - v.x, player.y - v.y);
          var vehicleRadiusSum = 36; // rough combined half-widths
          if (ramDist < vehicleRadiusSum && player.vehicle) {
            // Ram! inflict damage on player vehicle, slow it down
            if (VC.combat) {
              VC.combat.applyDamage(player, 12, v.x, v.y);
            } else {
              player.damage(12);
            }
            if (VC.wanted) VC.wanted.addCrime('rammed_police', player);
            // Bounce police car back
            var bang = Math.atan2(v.y - player.y, v.x - player.x);
            v.x += Math.cos(bang) * 24;
            v.y += Math.sin(bang) * 24;
          }
        }

        // ── Siren flicker timing ──
        c.sirenPhase = ((c.sirenPhase || 0) + dt * SIREN_FLICKER_HZ * Math.PI * 2) % (Math.PI * 2);

        // ── Vehicle clamp to world ──
        if (VC.city) {
          v.x = Math.max(10, Math.min(VC.city.worldWidth - 10, v.x));
          v.y = Math.max(10, Math.min(VC.city.worldHeight - 10, v.y));
        }
      }

      // ── Update foot officers ─────────────────────────────────────────────────
      for (i = footOfficers.length - 1; i >= 0; i--) {
        var fo = footOfficers[i];
        if (fo.dead) {
          footOfficers.splice(i, 1);
          continue;
        }
        var fd = Math.hypot(player.x - fo.x, player.y - fo.y);
        if (fd > DESPAWN_DIST) { footOfficers.splice(i, 1); continue; }

        // Police see player
        if (fd < SIGHT_RANGE && VC.wanted) VC.wanted.registerPoliceSpot();

        // Move toward player
        if (fd > 50) {
          var ang = Math.atan2(player.y - fo.y, player.x - fo.x);
          var spd = 110;
          fo.vx += (Math.cos(ang) * spd - fo.vx) * Math.min(1, dt * 4);
          fo.vy += (Math.sin(ang) * spd - fo.vy) * Math.min(1, dt * 4);
        } else {
          fo.vx *= 0.7;
          fo.vy *= 0.7;
        }
        fo.x += fo.vx * dt;
        fo.y += fo.vy * dt;

        // Shoot
        if (fd < FOOT_SHOOT_RANGE) {
          fo.shootTimer -= dt;
          if (fo.shootTimer <= 0) {
            fo.shootTimer = SHOOT_INTERVAL;
            if (VC.combat) {
              VC.combat.applyDamage(player, 10, fo.x, fo.y);
            } else {
              player.damage(10);
            }
            if (VC.Audio) VC.Audio.gunshot();
          }
        }
      }
    },

    // Render police siren light blobs in world-space (called inside camera transform)
    renderSirenLights: function(ctx, timeSec) {
      for (var i = 0; i < cruisers.length; i++) {
        var c = cruisers[i];
        var v = c.vehicle;
        // Alternate red/blue on each cycle
        var phase = c.sirenPhase || 0;
        var redOn  = Math.sin(phase) > 0;
        var blueOn = Math.sin(phase) < 0;

        if (redOn) {
          var rg = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 90);
          rg.addColorStop(0, 'rgba(255,30,30,0.22)');
          rg.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(v.x, v.y, 90, 0, Math.PI * 2);
          ctx.fill();
        } else if (blueOn) {
          var bg = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 90);
          bg.addColorStop(0, 'rgba(30,80,255,0.22)');
          bg.addColorStop(1, 'rgba(0,40,255,0)');
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(v.x, v.y, 90, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },

    // Render foot officers in world-space (Y-sorted caller should call this)
    renderFootOfficers: function(ctx) {
      for (var i = 0; i < footOfficers.length; i++) {
        var fo = footOfficers[i];
        if (fo.dead) continue;
        ctx.save();
        ctx.translate(fo.x, fo.y);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 3, 12, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Body (dark blue uniform)
        ctx.fillStyle = '#1a2c4a';
        VC.roundRect(ctx, -9, -10, 18, 20, 5);
        ctx.fill();
        // Vest / badge stripe
        ctx.fillStyle = '#d4aa00';
        ctx.fillRect(-6, -4, 12, 3);
        // Head
        ctx.fillStyle = '#d4a070';
        ctx.beginPath();
        ctx.arc(0, -12, 6, 0, Math.PI * 2);
        ctx.fill();
        // Cap
        ctx.fillStyle = '#121e30';
        ctx.fillRect(-7, -18, 14, 6);
        ctx.restore();
      }
    },

    // Render police cars in Y-sorted pass (wrapper — vehicles draw themselves)
    // Minimap dots for cruisers
    getMinimapDots: function() {
      var dots = [];
      for (var i = 0; i < cruisers.length; i++) {
        dots.push({ x: cruisers[i].vehicle.x, y: cruisers[i].vehicle.y, color: '#ff2244' });
      }
      return dots;
    }
  };

  VC.police = Police;
})();
