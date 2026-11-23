// Weapon system: pistol, shotgun, fists — projectiles, muzzle flash, reload, ammo HUD
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  // ── Weapon definitions ────────────────────────────────────────────────────
  var WEAPON_DEFS = {
    fists: {
      name: 'Fists',
      display: 'UNARMED',
      damage: 18,
      range: 32,
      spread: 0,
      pellets: 1,
      fireRate: 0.55,       // seconds between shots
      reloadTime: 0,
      clipSize: Infinity,
      reserveSize: Infinity,
      isHitscan: true,
      isMelee: true,
      shellCasing: false,
      muzzleColor: '#ffcc44'
    },
    vireo9: {
      name: 'Vireo 9',
      display: 'VIREO 9',
      damage: 28,
      range: 320,
      spread: 0.06,         // radians half-angle
      pellets: 1,
      fireRate: 0.22,
      reloadTime: 1.2,
      clipSize: 12,
      reserveSize: 60,
      isHitscan: true,
      isMelee: false,
      shellCasing: true,
      muzzleColor: '#ffee88'
    },
    breaker: {
      name: 'Breaker',
      display: 'BREAKER',
      damage: 14,           // per pellet (8 pellets)
      range: 160,
      spread: 0.28,
      pellets: 8,
      fireRate: 0.72,
      reloadTime: 2.1,
      clipSize: 6,
      reserveSize: 36,
      isHitscan: true,
      isMelee: false,
      shellCasing: true,
      muzzleColor: '#ff9922'
    }
  };

  // ── Particle pools ─────────────────────────────────────────────────────────
  var projectiles = [];   // tracer lines
  var muzzleFlashes = [];
  var shellCasings = [];
  var bulletDecals = [];

  // ── Weapon state ──────────────────────────────────────────────────────────
  var weaponState = {
    current: 'fists',
    clip: 12,
    reserve: 60,
    fireCooldown: 0,
    reloading: false,
    reloadTimer: 0,
    // cycle order
    order: ['fists', 'vireo9', 'breaker']
  };

  function getDef() {
    return WEAPON_DEFS[weaponState.current] || WEAPON_DEFS.fists;
  }

  function equip(key) {
    if (!WEAPON_DEFS[key]) return;
    weaponState.current = key;
    var def = WEAPON_DEFS[key];
    if (def.clipSize === Infinity) {
      weaponState.clip = Infinity;
      weaponState.reserve = Infinity;
    } else {
      weaponState.clip = def.clipSize;
      weaponState.reserve = def.reserveSize;
    }
    weaponState.reloading = false;
    weaponState.reloadTimer = 0;
    weaponState.fireCooldown = 0;
  }

  function cycleWeapon() {
    var idx = weaponState.order.indexOf(weaponState.current);
    var next = weaponState.order[(idx + 1) % weaponState.order.length];
    equip(next);
    if (VC.hud) VC.hud.toast(WEAPON_DEFS[next].display + ' EQUIPPED', 1.0);
  }

  function startReload() {
    var def = getDef();
    if (def.clipSize === Infinity) return;
    if (weaponState.reloading) return;
    if (weaponState.reserve <= 0) return;
    if (weaponState.clip >= def.clipSize) return;
    weaponState.reloading = true;
    weaponState.reloadTimer = def.reloadTime;
    if (VC.Audio) VC.Audio.uiBlip(380);
    if (VC.hud) VC.hud.toast('RELOADING...', def.reloadTime);
  }

  function spawnMuzzleFlash(wx, wy, angle) {
    muzzleFlashes.push({ x: wx, y: wy, angle: angle, life: 0.07, maxLife: 0.07 });
  }

  function spawnShellCasing(wx, wy, angle) {
    var ejectAngle = angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.6;
    var speed = 55 + Math.random() * 45;
    shellCasings.push({
      x: wx, y: wy,
      vx: Math.cos(ejectAngle) * speed,
      vy: Math.sin(ejectAngle) * speed,
      life: 0.8,
      maxLife: 0.8,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 18
    });
    if (shellCasings.length > 60) shellCasings.shift();
  }

  function spawnBulletDecal(wx, wy) {
    bulletDecals.push({ x: wx, y: wy, alpha: 0.6, life: 18 });
    if (bulletDecals.length > 80) bulletDecals.shift();
  }

  function spawnTracerProjectile(sx, sy, tx, ty) {
    projectiles.push({
      x: sx, y: sy,
      tx: tx, ty: ty,
      life: 0.08, maxLife: 0.08
    });
  }

  // Fire at world-space (tx,ty) from player (px,py,facing)
  function fire(player, worldTargetX, worldTargetY) {
    if (!player) return false;
    var def = getDef();

    if (weaponState.fireCooldown > 0) return false;
    if (weaponState.reloading) return false;

    // Check ammo
    if (def.clipSize !== Infinity && weaponState.clip <= 0) {
      startReload();
      return false;
    }

    // Muzzle world position (in front of player)
    var muzzleDist = def.isMelee ? 24 : 20;
    var muzzleX = player.x + Math.cos(player.facing) * muzzleDist;
    var muzzleY = player.y + Math.sin(player.facing) * muzzleDist;

    // Melee handling
    if (def.isMelee) {
      player.punchTimer = 0.22;
      player.punchHand = (player.punchHand + 1) % 2;
      spawnMuzzleFlash(muzzleX, muzzleY, player.facing);
      weaponState.fireCooldown = def.fireRate;
      if (VC.Audio) VC.Audio.punchSound();
      // Check hit radius
      var dist = Math.hypot(worldTargetX - player.x, worldTargetY - player.y);
      if (dist < def.range) {
        return { hit: true, damage: def.damage, hitscan: true, x: worldTargetX, y: worldTargetY };
      }
      return false;
    }

    // Deduct ammo
    if (def.clipSize !== Infinity) {
      weaponState.clip = Math.max(0, weaponState.clip - 1);
    }
    weaponState.fireCooldown = def.fireRate;

    // Spawn effects
    spawnMuzzleFlash(muzzleX, muzzleY, player.facing);
    if (def.shellCasing) spawnShellCasing(muzzleX, muzzleY, player.facing);
    if (VC.Audio) VC.Audio.gunshot();

    // Hitscan rays (one per pellet)
    var hits = [];
    for (var p = 0; p < def.pellets; p++) {
      var ang = player.facing + (Math.random() - 0.5) * 2 * def.spread;
      var hitX = player.x + Math.cos(ang) * def.range;
      var hitY = player.y + Math.sin(ang) * def.range;
      spawnTracerProjectile(muzzleX, muzzleY, hitX, hitY);
      spawnBulletDecal(hitX, hitY);
      hits.push({ hit: true, damage: def.damage, x: hitX, y: hitY });
    }

    // Trigger wanted level: fired a weapon in public
    if (VC.wanted && player.wantedLevel !== undefined) {
      VC.wanted.addCrime('fired_weapon');
    }

    // Auto-reload if clip empty
    if (def.clipSize !== Infinity && weaponState.clip <= 0) {
      startReload();
    }

    return hits;
  }

  function update(dt) {
    if (weaponState.fireCooldown > 0) {
      weaponState.fireCooldown = Math.max(0, weaponState.fireCooldown - dt);
    }
    if (weaponState.reloading) {
      weaponState.reloadTimer -= dt;
      if (weaponState.reloadTimer <= 0) {
        weaponState.reloading = false;
        var def = getDef();
        var need = def.clipSize - weaponState.clip;
        var fromReserve = Math.min(need, weaponState.reserve);
        weaponState.clip += fromReserve;
        weaponState.reserve -= fromReserve;
        if (VC.hud) VC.hud.toast(def.display + ' RELOADED', 0.8);
        if (VC.Audio) VC.Audio.uiBlip(900);
      }
    }

    // age particle pools
    var i;
    for (i = muzzleFlashes.length - 1; i >= 0; i--) {
      muzzleFlashes[i].life -= dt;
      if (muzzleFlashes[i].life <= 0) muzzleFlashes.splice(i, 1);
    }
    for (i = shellCasings.length - 1; i >= 0; i--) {
      var sc = shellCasings[i];
      sc.x += sc.vx * dt;
      sc.y += sc.vy * dt;
      sc.vx *= 0.82;
      sc.vy *= 0.82;
      sc.angle += sc.spin * dt;
      sc.life -= dt;
      if (sc.life <= 0) shellCasings.splice(i, 1);
    }
    for (i = projectiles.length - 1; i >= 0; i--) {
      projectiles[i].life -= dt;
      if (projectiles[i].life <= 0) projectiles.splice(i, 1);
    }
    for (i = bulletDecals.length - 1; i >= 0; i--) {
      bulletDecals[i].life -= dt;
      if (bulletDecals[i].life <= 0) bulletDecals.splice(i, 1);
    }
  }

  function renderWorldEffects(ctx) {
    var i, item;

    // Bullet decals
    ctx.fillStyle = '#1a0a00';
    for (i = 0; i < bulletDecals.length; i++) {
      item = bulletDecals[i];
      ctx.globalAlpha = item.alpha * Math.min(1, item.life / 2);
      ctx.beginPath();
      ctx.arc(item.x, item.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Tracer lines
    for (i = 0; i < projectiles.length; i++) {
      item = projectiles[i];
      var a = item.life / item.maxLife;
      ctx.save();
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = '#ffee88';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#ffee88';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.tx, item.ty);
      ctx.stroke();
      ctx.restore();
    }

    // Shell casings
    for (i = 0; i < shellCasings.length; i++) {
      var sc2 = shellCasings[i];
      var ca = sc2.life / sc2.maxLife;
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.translate(sc2.x, sc2.y);
      ctx.rotate(sc2.angle);
      ctx.fillStyle = '#d4a800';
      ctx.fillRect(-2, -1, 4, 2);
      ctx.restore();
    }

    // Muzzle flashes
    for (i = 0; i < muzzleFlashes.length; i++) {
      var mf = muzzleFlashes[i];
      var ma = mf.life / mf.maxLife;
      ctx.save();
      ctx.globalAlpha = ma;
      ctx.translate(mf.x, mf.y);
      ctx.rotate(mf.angle);
      // Core bright
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      // Halo glow
      var grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
      grad.addColorStop(0, 'rgba(255, 220, 100, 0.9)');
      grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Expose
  VC.Weapons = {
    state: weaponState,
    defs: WEAPON_DEFS,
    equip: equip,
    cycleWeapon: cycleWeapon,
    fire: fire,
    startReload: startReload,
    update: update,
    renderWorldEffects: renderWorldEffects,
    getDef: getDef,
    muzzleFlashes: muzzleFlashes,
    projectiles: projectiles,
    shellCasings: shellCasings,
    bulletDecals: bulletDecals
  };
})();
