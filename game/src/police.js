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
  var MAX_CRUISERS      = 5;
  var SPAWN_DIST        = 650;    // spawn outside this range from player
  var DESPAWN_DIST      = 1200;

  // Foot officer spawns at 3+ stars
  var MAX_FOOT_OFFICERS = 4;
  var MAX_ROADBLOCKS = 3;

  // ── State ──────────────────────────────────────────────────────────────────
  var cruisers = [];        // { vehicle: VC.Vehicle, ai: {...}, shootTimer: 0, sirenPhase: 0 }
  var footOfficers = [];    // { x, y, vx, vy, shootTimer, dead }
  var roadblocks = [];
  var roadblockTimer = 0;
  var spawnTimer = 0;
  var footSpawnTimer = 0;
  var active = false;
  var policeSpawnIndex = 0;
  // Police comment: cruisers, motorcycles, and rangers now have distinct pursuit roles and braking behavior.

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getCurrentWantedLevel() {
    return VC.wanted ? VC.wanted.level : 0;
  }

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

    var heavy = getCurrentWantedLevel() >= 6;
    var policeType = heavy ? 'ranger' : (getCurrentWantedLevel() >= 3 && policeSpawnIndex % 4 === 0 ? 'motorcycle' : 'interceptor');
    policeSpawnIndex++;
    var v = new VC.Vehicle(policeType, sx, sy, angle);
    v.speed = 0;
    v.lightsOn = true;
    // Mark this as a police car (affects wanted crime if rammed)
    v.isPolice = true;
    if (heavy) {
      v.health = 180;
      v.maxHealth = 180;
      v.color = '#263238';
      v.ramPower = 1.8;
      v.heavy = true;
      v.sirenOn = true;
    } else {
      v.ramPower = 1.0;
    }

    cruisers.push({
      vehicle: v,
      shootTimer: SHOOT_INTERVAL,
      sirenPhase: Math.random() * Math.PI * 2,
      state: 'chase',   // 'chase' | 'ram' | 'disabled'
      disabled: false,
      heavy: heavy
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

  function spawnRoadblock(player) {
    if (!VC.city || !player || roadblocks.length >= MAX_ROADBLOCKS) return;
    var ahead = player.vehicle ? player.vehicle.heading : player.facing;
    var candidates = [];
    for (var i = 0; i < VC.city.intersections.length; i++) {
      var inter = VC.city.intersections[i];
      var cx = inter.x + inter.w * 0.5;
      var cy = inter.y + inter.h * 0.5;
      var dx = cx - player.x, dy = cy - player.y;
      var dist = Math.hypot(dx, dy);
      var dot = (dx * Math.cos(ahead) + dy * Math.sin(ahead)) / Math.max(1, dist);
      if (dist > 220 && dist < 520 && dot > 0.55) candidates.push({ x: cx, y: cy, dist: dist });
    }
    if (!candidates.length) return;
    candidates.sort(function(a, b) { return a.dist - b.dist; });
    var p = candidates[0];
    var horizontal = Math.abs(Math.cos(ahead)) >= Math.abs(Math.sin(ahead));
    roadblocks.push({
      x: p.x, y: p.y,
      heading: horizontal ? 0 : Math.PI / 2,
      life: 34,
      flash: Math.random() * Math.PI * 2,
      damagedTimer: 0
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

    // Vehicle keeps its tuning on the instance (this.turnSpeed), not under a .type bag.
    var turn = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), v.turnSpeed * dt);
    v.heading += turn;

    var wanted = VC.wanted ? VC.wanted.level : 0;
    var targetSpeed = wanted >= 4 ? RAM_SPEED : INTERCEPT_SPEED;
    // Slow down when close
    var dist = Math.hypot(dx, dy);
    if (dist < 80) targetSpeed *= 0.5;
    if (v.typeKey === 'motorcycle') targetSpeed *= 1.12;
    if (cruiserEntry.heavy) targetSpeed *= 0.82;

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
    roadblocks: roadblocks,

    // Deterministic scene helper; gives shot/firefight modes visible dismounted units.
    seedFootOfficers: function(num, player) {
      footOfficers.length = 0;
      for (var i = 0; i < num; i++) {
        footOfficers.push({
          x: player.x + (i === 0 ? 150 : -170),
          y: player.y + (i === 0 ? -70 : 90),
          vx: 0, vy: 0,
          shootTimer: 0.3 + i * 0.25,
          dead: false, health: 55,
          sideCover: i % 2 ? 1 : -1,
          aimAngle: 0
        });
      }
    },

    onWantedLevelChange: function(level) {
      active = level > 0;
      if (level === 0) {
        // All units stand down
        cruisers.length = 0;
        footOfficers.length = 0;
        roadblocks.length = 0;
        spawnTimer = 0;
        footSpawnTimer = 0;
        roadblockTimer = 0;
        if (VC.Audio) VC.Audio.stopSiren();
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

      // Roadblocks begin at 4 stars and recycle on the busiest intersections ahead
      roadblockTimer -= dt;
      if (wanted >= 4 && roadblockTimer <= 0) {
        spawnRoadblock(player);
        roadblockTimer = 12 + (6 - wanted) * 1.8;
      }
      for (var rb = roadblocks.length - 1; rb >= 0; rb--) {
        var block = roadblocks[rb];
        block.life -= dt;
        block.flash += dt * 7;
        if (block.life <= 0 || Math.hypot(player.x - block.x, player.y - block.y) > 900) {
          roadblocks.splice(rb, 1);
          continue;
        }
        if (player.vehicle) {
          var bd = Math.hypot(player.vehicle.x - block.x, player.vehicle.y - block.y);
          if (bd < 58) {
            var impact = Math.abs(player.vehicle.speed);
            block.damagedTimer = 0.55;
            player.vehicle.roadblockStuck = 1.1;
            player.vehicle.speed *= impact > 180 ? -0.18 : -0.28;
            if (impact > 75) player.vehicle.damage(Math.round(Math.min(42, impact * 0.28)));
            if (VC.combat) VC.combat.applyDamage(player, impact > 220 ? 16 : 8, block.x, block.y);
            if (VC.hud) VC.hud.toast('ROADBLOCK IMPACT // VEHICLE DAMAGED', 1.2);
            player.vehicle.x += (player.vehicle.x - block.x) * 0.12;
            player.vehicle.y += (player.vehicle.y - block.y) * 0.12;
          }
        }
      }

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

        if (v.exploded || v.health <= 0) {
          if (v.exploded) VC.explodeVehicle(v);
          cruisers.splice(i, 1);
          continue;
        }

        // Despawn if too far away
        var dToPl = Math.hypot(player.x - v.x, player.y - v.y);
        if (dToPl > DESPAWN_DIST) {
          cruisers.splice(i, 1);
          continue;
        }

        // If the player has jacked this car, skip AI
        if (v.driver === player) continue;

        // Police see the player → reset decay
        var concealed = VC.wanted ? VC.wanted.isPlayerConcealed(player, VC.city) : false;
        if (dToPl < SIGHT_RANGE && !concealed && VC.wanted) VC.wanted.registerPoliceSpot();
        if (concealed) c.state = 'search';
        else c.state = 'chase';

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
            if (VC.Weapons) {
              VC.Weapons.spawnImpactTracer(v.x, v.y, player.x, player.y, 'vireo9');
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
            var ramDamage = c.heavy ? 24 : 12;
            if (VC.combat) {
              VC.combat.applyDamage(player, ramDamage, v.x, v.y);
            } else {
              player.damage(12);
            }
            if (player.vehicle) player.vehicle.damage(c.heavy ? 34 : 16);
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
        var foConcealed = VC.wanted ? VC.wanted.isPlayerConcealed(player, VC.city) : false;
        if (fd < SIGHT_RANGE && !foConcealed && VC.wanted) VC.wanted.registerPoliceSpot();

        // Move toward player, seek cover while visible, and return to a cruiser when concealed
        if (foConcealed && cruisers.length) {
          var returnTo = cruisers[0].vehicle;
          var ang = Math.atan2(returnTo.y - fo.y, returnTo.x - fo.x);
          var spd = 125;
          fo.vx += (Math.cos(ang) * spd - fo.vx) * Math.min(1, dt * 4);
          fo.vy += (Math.sin(ang) * spd - fo.vy) * Math.min(1, dt * 4);
        } else if (fd > 50) {
          var ang = Math.atan2(player.y - fo.y, player.x - fo.x);
          if (!foConcealed && fd < 210) {
            var sideAngle = ang + (fo.sideCover || 1) * Math.PI * 0.5;
            ang = sideAngle;
            fo.sideCover = fo.sideCover || (Math.random() > 0.5 ? 1 : -1);
          }
          var spd = 110;
          fo.vx += (Math.cos(ang) * spd - fo.vx) * Math.min(1, dt * 4);
          fo.vy += (Math.sin(ang) * spd - fo.vy) * Math.min(1, dt * 4);
        } else {
          fo.vx *= 0.7;
          fo.vy *= 0.7;
        }
        fo.x += fo.vx * dt;
        fo.y += fo.vy * dt;
        fo.aimAngle = Math.atan2(player.y - fo.y, player.x - fo.x);

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
            if (VC.Weapons) {
              VC.Weapons.spawnImpactTracer(fo.x, fo.y, player.x, player.y, 'vireo9');
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
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.heading);
        ctx.globalCompositeOperation = 'lighter';
        var head = ctx.createLinearGradient(18, 0, 112, 0);
        head.addColorStop(0, 'rgba(255,248,205,0.28)');
        head.addColorStop(1, 'rgba(255,248,205,0)');
        ctx.fillStyle = head;
        ctx.beginPath();
        ctx.moveTo(18, -7);
        ctx.lineTo(112, -25);
        ctx.lineTo(112, 25);
        ctx.lineTo(18, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },

    renderRoadblocks: function(ctx, timeSec) {
      for (var i = 0; i < roadblocks.length; i++) {
        var b = roadblocks[i];
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.heading);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-70, 10, 140, 18);
        ctx.fillStyle = '#d8dde3';
        ctx.fillRect(-68, -8, 136, 16);
        ctx.fillStyle = '#111827';
        ctx.fillRect(-68, -8, 136, 5);
        ctx.fillRect(-68, 3, 136, 5);
        ctx.fillStyle = '#ff1744';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VPD  //  ROAD CLOSED', 0, -10);
        for (var c = -54; c <= 54; c += 27) {
          ctx.fillStyle = '#ff7a18';
          ctx.beginPath();
          ctx.moveTo(c - 7, 18); ctx.lineTo(c, 5); ctx.lineTo(c + 7, 18); ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(c - 5, 16, 10, 3);
        }
        var on = Math.sin(b.flash) > 0;
        ctx.fillStyle = on ? '#ff1744' : '#5b1018';
        ctx.shadowColor = on ? '#ff1744' : '#000';
        ctx.shadowBlur = on ? 18 : 0;
        ctx.beginPath(); ctx.arc(-58, -14, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = on ? '#1b5cff' : '#101b33';
        ctx.beginPath(); ctx.arc(58, -14, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },

    // Render foot officers in world-space (Y-sorted caller should call this)
    renderFootOfficers: function(ctx) {
      for (var i = 0; i < footOfficers.length; i++) {
        var fo = footOfficers[i];
        if (fo.dead) continue;
        ctx.save();
        ctx.translate(fo.x, fo.y);
        ctx.rotate(fo.aimAngle || 0);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 3, 13, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff2aa1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.stroke();
        // Body (dark blue uniform)
        ctx.fillStyle = '#2a1732';
        VC.roundRect(ctx, -9, -10, 18, 20, 5);
        ctx.fill();
        ctx.fillStyle = '#ff2aa1';
        ctx.fillRect(-8, -7, 16, 4);
        ctx.fillStyle = '#ef3f7b';
        ctx.fillRect(-11, -22, 22, 3);
        ctx.fillStyle = '#43df6b';
        ctx.fillRect(-11, -22, 22 * Math.max(0.25, fo.health / 55), 3);
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
        ctx.fillStyle = '#ff2aa1';
        ctx.fillRect(-5, -20, 10, 2);
        ctx.fillStyle = '#ff1744';
        ctx.globalAlpha = fo.shootTimer < 0.25 ? 1 : 0.35;
        // Heavy-unit rifle, aimed toward the player's current position
        var aim = fo.shootTimer < 0.25 ? '#ffb300' : '#697b8f';
        ctx.save();
        ctx.rotate(fo.aimAngle || 0);
        ctx.fillStyle = '#11151c';
        ctx.fillRect(4, -2, 22, 4);
        ctx.globalAlpha = fo.shootTimer < 0.25 ? 1 : 0.75;
        ctx.fillStyle = aim;
        ctx.fillRect(20, -1, 8, 2);
        if (fo.shootTimer < 0.25) {
          ctx.fillStyle = '#fff1a6';
          ctx.shadowColor = '#ff1744';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(28, 0);
          ctx.lineTo(38, -5);
          ctx.lineTo(35, 1);
          ctx.lineTo(40, 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
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
