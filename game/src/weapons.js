// Weapon system: pistol, shotgun, fists — projectiles, muzzle flash, reload, ammo HUD
(function() {
  'use strict';
  // Weapon comment: shotgun spread, sniper aim, reload timing, and crate state are all exposed through VC.Weapons.

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
    },
    scatter12: {
      name: 'Scatter 12',
      display: 'SCATTER 12',
      damage: 16,
      range: 150,
      spread: 0.34,
      pellets: 10,
      fireRate: 0.82,
      recoil: 0.62,
      reloadTime: 2.4,
      clipSize: 8,
      reserveSize: 40,
      isHitscan: true,
      isMelee: false,
      shellCasing: true,
      muzzleColor: '#ffb12b'
    },
    longshot: {
      name: 'Longshot',
      display: 'LONGSHOT .50',
      damage: 95,
      range: 720,
      spread: 0.012,
      pellets: 1,
      fireRate: 1.45,
      recoil: 0.38,
      reloadTime: 2.8,
      clipSize: 5,
      reserveSize: 20,
      isHitscan: true,
      isMelee: false,
      shellCasing: true,
      muzzleColor: '#fff0b3'
    }
  };

  // ── Particle pools ─────────────────────────────────────────────────────────
  var projectiles = [];   // tracer lines
  var muzzleFlashes = [];
  var shellCasings = [];
  var bulletDecals = [];
  var weaponBoxes = [];

  function syncCityBoxes(city) {
    weaponBoxes.length = 0;
    if (!city || !city.interactables) return;
    for (var i = 0; i < city.interactables.length; i++) {
      var item = city.interactables[i];
      if (item.type === 'weapon_box') {
        weaponBoxes.push({ x: item.x, y: item.y, weapon: item.weapon, id: item.id, taken: false });
      }
    }
  }

  function getSaveData() {
    var taken = [];
    for (var i = 0; i < weaponBoxes.length; i++) {
      if (weaponBoxes[i].taken) taken.push(weaponBoxes[i].id);
    }
    return { taken: taken };
  }

  function fromSaveData(data) {
    if (!data || !data.taken) return;
    for (var i = 0; i < weaponBoxes.length; i++) {
      weaponBoxes[i].taken = data.taken.indexOf(weaponBoxes[i].id) !== -1;
    }
  }

  // ── Weapon state ──────────────────────────────────────────────────────────
  var weaponState = {
    current: 'fists',
    clip: 12,
    reserve: 60,
    fireCooldown: 0,
    reloading: false,
    reloadTimer: 0,
    // cycle order
    order: ['fists', 'vireo9', 'breaker', 'scatter12', 'longshot'],
    aiming: false
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
    var rng = VC.RNG && VC.RNG.stream ? VC.RNG.stream('weapons') : null;
    var ejectAngle = angle + Math.PI * 0.5 + ((rng ? rng.random() : Math.random()) - 0.5) * 0.6;
    var speed = 55 + (rng ? rng.random() : Math.random()) * 45;
    shellCasings.push({
      x: wx, y: wy,
      vx: Math.cos(ejectAngle) * speed,
      vy: Math.sin(ejectAngle) * speed,
      life: 0.8,
      maxLife: 0.8,
      angle: (rng ? rng.random() : Math.random()) * Math.PI * 2,
      spin: ((rng ? rng.random() : Math.random()) - 0.5) * 18
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
      life: 0.08, maxLife: 0.08,
      weapon: weaponState.current
    });
  }

  function spawnImpactTracer(sx, sy, tx, ty, weapon) {
    projectiles.push({
      x: sx, y: sy, tx: tx, ty: ty,
      life: 0.12, maxLife: 0.12,
      weapon: weapon || 'vireo9'
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
    if (VC.Audio) {
      if (weaponState.current === 'scatter12' && VC.Audio.shotgunSound) VC.Audio.shotgunSound();
      else if (weaponState.current === 'longshot' && VC.Audio.sniperSound) VC.Audio.sniperSound();
      else VC.Audio.gunshot();
    }

    // Hitscan rays (one per pellet)
    var hits = [];
    var rng = VC.RNG && VC.RNG.stream ? VC.RNG.stream('weapons') : null;
    for (var p = 0; p < def.pellets; p++) {
      var randomSpread = rng ? rng.random() : Math.random();
      var ang = player.facing + (randomSpread - 0.5) * 2 * def.spread;
      var hitX = player.x + Math.cos(ang) * def.range;
      var hitY = player.y + Math.sin(ang) * def.range;
      spawnTracerProjectile(muzzleX, muzzleY, hitX, hitY);
      spawnBulletDecal(hitX, hitY);
      hits.push({ hit: true, damage: def.damage, x: hitX, y: hitY });
    }

    if (def.recoil && VC.camera) {
      VC.camera.shake(def.recoil * 10, 0.12);
    }
    if (weaponState.current === 'longshot') {
      weaponState.aiming = true;
    }

    // Resolve world hits against dismounted police and show stagger/death feedback.
    if (VC.police && VC.police.footOfficers) {
      for (var h = 0; h < hits.length; h++) {
        for (var o = 0; o < VC.police.footOfficers.length; o++) {
          var officer = VC.police.footOfficers[o];
          if (officer.dead) continue;
          if (Math.hypot(officer.x - hits[h].x, officer.y - hits[h].y) < 22) {
            officer.health = (officer.health || 55) - hits[h].damage;
            if (VC.combat) VC.combat.registerEnemyHit(officer, hits[h].damage);
            if (officer.health <= 0) {
              if (VC.combat) VC.combat.registerEnemyDeath(officer);
              else officer.dead = true;
            }
            break;
          }
        }
      }
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

  function getNearbyBox(player) {
    if (!player) return null;
    for (var i = 0; i < weaponBoxes.length; i++) {
      var box = weaponBoxes[i];
      if (!box.taken && Math.hypot(player.x - box.x, player.y - box.y) < 48) return box;
    }
    return null;
  }

  function pickupNearby(player) {
    var box = getNearbyBox(player);
    if (!box) return false;
    box.taken = true;
    equip(box.weapon);
    if (VC.hud) VC.hud.toast(WEAPON_DEFS[box.weapon].display + ' PICKED UP', 2.2);
    if (VC.Audio) VC.Audio.uiBlip(1250);
    return true;
  }

  function renderWeaponBoxes(ctx, timeSec) {
    for (var i = 0; i < weaponBoxes.length; i++) {
      var box = weaponBoxes[i];
      if (box.taken) continue;
      var pulse = 1 + 0.12 * Math.sin((timeSec || 0) * 4 + i);
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.shadowColor = box.weapon === 'longshot' ? '#ff5c55' : '#ffb12b';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(255,190,60,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#202833';
      ctx.strokeStyle = '#ffd66b';
      ctx.lineWidth = 2;
      ctx.fillRect(-18, -12, 36, 24);
      ctx.strokeRect(-18, -12, 36, 24);
      ctx.fillStyle = '#ffb12b';
      ctx.fillRect(-12, -3, 24, 6);
      ctx.restore();
    }
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
      ctx.strokeStyle = item.weapon === 'longshot' ? '#fff4cf' : item.weapon === 'scatter12' ? '#ffb12b' : '#ffee88';
      ctx.lineWidth = item.weapon === 'longshot' ? 2.2 : item.weapon === 'scatter12' ? 1.1 : 1.5;
      ctx.shadowColor = ctx.strokeStyle;
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
    renderWeaponBoxes: renderWeaponBoxes,
    getNearbyBox: getNearbyBox,
    pickupNearby: pickupNearby,
    getDef: getDef,
    syncCityBoxes: syncCityBoxes,
    getSaveData: getSaveData,
    fromSaveData: fromSaveData,
    muzzleFlashes: muzzleFlashes,
    projectiles: projectiles,
    shellCasings: shellCasings,
    bulletDecals: bulletDecals,
    spawnImpactTracer: spawnImpactTracer,
    spawnShellCasing: spawnShellCasing
  };
})();
