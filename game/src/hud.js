// Heads-Up Display: status bars, wanted, ammo, mission tracker, radio banner, cash anim, combat flash
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var toasts = [];
  var showFullMap = false;

  // ── Cash animation ─────────────────────────────────────────────────────────
  var cashDisplay  = 0;    // animated value
  var cashTarget   = 0;    // actual value
  var cashFlash    = 0;    // seconds of green flash

  function formatCash(amount) {
    var rounded = Math.round((Number(amount) || 0) * 100) / 100;
    if (Object.is(rounded, -0) || rounded === 0) return '$0';

    var sign = rounded < 0 ? '-' : '';
    var absolute = Math.abs(rounded);
    var parts = absolute.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var fraction = parts[1].replace(/0+$/, '');
    return sign + '$' + parts[0] + (fraction ? '.' + fraction : '');
  }

  // ── GAME SAVED toast ──────────────────────────────────────────────────────
  var savedToast   = 0;    // countdown timer

  // ── Radio banner ──────────────────────────────────────────────────────────
  var RADIO_STATIONS = [
    { station: 'NEON FM 97.3',  track: 'City at Night — The Velour Wraith' },
    { station: 'BASS COAST 88', track: 'Southside Surge — DJ Caldera' },
    { station: 'STATIC ZERO',   track: 'Signal Lost (Club Edit) — Mira & The Ghosts' },
    { station: 'MIDNIGHT WAVE',  track: 'Red-Line Rider — Recto Sound System' },
    { station: 'VAULT RADIO',   track: 'Cold Chrome Morning — The Dex Effect' }
  ];
  var radioIndex    = 0;
  var radioTimer    = 0;    // seconds until next station switch
  var RADIO_INTERVAL = 28;

  // ── Wanted decay timer display ─────────────────────────────────────────────
  var wantedBlinkTimer = 0;

  function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    var rot = (Math.PI / 2) * 3;
    var x = cx;
    var y = cy;
    var step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (var i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;
      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  var HUD = {
    toast: function(message, duration) {
      toasts.push({ text: message, time: duration || 3.0, maxTime: duration || 3.0 });
      if (toasts.length > 5) toasts.shift();
    },

    showSavedToast: function() {
      savedToast = 2.5;
    },

    toggleMap: function() {
      showFullMap = !showFullMap;
      return showFullMap;
    },

    isMapOpen: function() { return showFullMap; },

    update: function(dt, player) {
      // Toast decay
      for (var i = toasts.length - 1; i >= 0; i--) {
        toasts[i].time -= dt;
        if (toasts[i].time <= 0) toasts.splice(i, 1);
      }

      // Saved toast
      if (savedToast > 0) savedToast -= dt;

      // Radio cycle
      radioTimer -= dt;
      if (radioTimer <= 0) {
        radioTimer = RADIO_INTERVAL;
        radioIndex = (radioIndex + 1) % RADIO_STATIONS.length;
      }

      // Cash animation
      if (player) {
        if (player.cash !== cashTarget) {
          cashFlash = 0.6;
          cashTarget = player.cash;
        }
        if (cashFlash > 0) cashFlash -= dt;
        var diff = cashTarget - cashDisplay;
        cashDisplay += diff * Math.min(1, dt * 7);
        if (Math.abs(diff) < 0.5) cashDisplay = cashTarget;
      }

      // Map toggle
      if (VC.Input && (VC.Input.justPressed('Tab') || VC.Input.justPressed('KeyM'))) {
        this.toggleMap();
        if (VC.Audio) VC.Audio.uiBlip(880);
      }

      // Wanted blink
      wantedBlinkTimer += dt;
    },

    render: function(ctx, player, city, timeSec) {
      if (!player) return;
      ctx.save();

      // 1. Player status (top-left)
      this.renderPlayerStatus(ctx, player, timeSec);

      // 2. Top-right: cash, wanted
      this.renderTopRight(ctx, player, timeSec);

      // 3. Bottom-left: weapon badge or vehicle dashboard
      if (player.vehicle) {
        this.renderVehicleDashboard(ctx, player.vehicle, timeSec);
      } else {
        this.renderWeaponBadge(ctx, player, timeSec);
        if (player.nearVehicle) this.renderVehiclePrompt(ctx, player.nearVehicle);
      }

      // 4. Upper-center: Mission tracker
      this.renderMissionTracker(ctx, timeSec);

      // 5. Crosshair (on foot only)
      if (!player.vehicle) this.renderCrosshair(ctx);

      // 6. Toasts
      this.renderToasts(ctx);

      // 7. Minimap
      if (VC.Minimap) VC.Minimap.render(ctx, player, city, timeSec);

      // 8. Full map overlay
      if (showFullMap) {
        if (VC.Minimap) VC.Minimap.renderFullMap(ctx, player, city);
        else this.renderMapOverlay(ctx, player, city);
      }

      // 9. Radio banner (upper-right, clear of the bottom minimap)
      this.renderRadioBanner(ctx, timeSec);

      // 10. GAME SAVED toast (center-bottom)
      if (savedToast > 0) this.renderSavedToast(ctx, savedToast);

      // 11. Mission complete banner
      if (VC.Missions && VC.Missions.state.banner) {
        this.renderMissionBanner(ctx, VC.Missions.state.banner, timeSec);
      }

      // 12. Mission briefing dialog
      if (VC.Missions && VC.Missions.state.dialog) {
        this.renderMissionDialog(ctx, VC.Missions.state.dialog, timeSec);
      }

      ctx.restore();
    },

    // ── Player status (top-left) ─────────────────────────────────────────────
    renderPlayerStatus: function(ctx, player, timeSec) {
      var x = 28, y = 24;
      ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1.5;
      VC.roundRect(ctx, x, y, 224, 62, 5);
      ctx.fill(); ctx.stroke();

      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('V. CROSS // VIREO CITY', x + 10, y + 7);

      var hpRatio = Math.max(0, player.health / player.maxHealth);
      var hpW = 140, hpH = 10, hpX = x + 68, hpY = y + 26;

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#8aa0b8';
      ctx.textBaseline = 'middle';
      ctx.fillText('HEALTH', x + 10, hpY + 5);

      ctx.fillStyle = '#101620';
      ctx.fillRect(hpX, hpY, hpW, hpH);
      var isLowHp = player.health < 30;
      var hpColor = '#00e676';
      if (isLowHp) hpColor = Math.sin((timeSec || 0) * 12) > 0 ? '#ff1744' : '#b71c1c';
      ctx.fillStyle = hpColor;
      ctx.fillRect(hpX, hpY, hpW * hpRatio, hpH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(hpX, hpY, hpW, hpH);

      var arRatio = Math.max(0, player.armor / player.maxArmor);
      var arH = 6, arY = y + 42;
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#8aa0b8';
      ctx.fillText('ARMOR', x + 10, arY + 3);
      ctx.fillStyle = '#101620';
      ctx.fillRect(hpX, arY, hpW, arH);
      ctx.fillStyle = '#00b0ff';
      ctx.fillRect(hpX, arY, hpW * arRatio, arH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeRect(hpX, arY, hpW, arH);
    },

    // ── Top-right: cash + wanted ─────────────────────────────────────────────
    renderTopRight: function(ctx, player, timeSec) {
      var rightX = 1252, y = 24;
      var boxW = 210, boxH = 44, boxX = rightX - boxW;

      ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
      ctx.strokeStyle = cashFlash > 0 ? 'rgba(57,255,20,0.8)' : 'rgba(57,255,20,0.35)';
      ctx.lineWidth = 1.5;
      VC.roundRect(ctx, boxX, y, boxW, boxH, 5);
      ctx.fill(); ctx.stroke();

      var cashStr = formatCash(cashDisplay);
      VC.drawGlowText(ctx, cashStr, boxX + boxW / 2, y + 22, 'bold 20px "Courier New", monospace',
        cashFlash > 0 ? '#88ffaa' : '#39ff14', 'rgba(57,255,20,0.5)', 8, 'center');

      // Wanted stars block
      var wanted = VC.wanted ? VC.wanted.level : player.wantedLevel;
      var isDecaying = VC.wanted ? VC.wanted.isDecaying() : false;
      var isBlinking = VC.wanted ? VC.wanted.isBlinking() : false;
      var starBoxY = y + 52, starBoxH = 26;

      ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
      ctx.strokeStyle = wanted > 0 ? 'rgba(255,34,68,0.6)' : 'rgba(100,120,150,0.25)';
      VC.roundRect(ctx, boxX, starBoxY, boxW, starBoxH, 4);
      ctx.fill(); ctx.stroke();

      for (var s = 0; s < 5; s++) {
        var sx = boxX + 24 + s * 38, sy = starBoxY + starBoxH / 2;
        var isActive = s < wanted;
        drawStar(ctx, sx, sy, 5, 9, 4.5);
        if (isActive) {
          var starFlash = isBlinking ? Math.sin(wantedBlinkTimer * 10) > 0 : true;
          ctx.fillStyle = starFlash ? (isDecaying ? '#ffaa00' : '#ff2244') : '#553300';
          ctx.shadowColor = '#ff2244';
          ctx.shadowBlur = starFlash ? 10 : 0;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = '#3a4759';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // "EVADING" / "WANTED" decay label
      if (isDecaying && wanted > 0) {
        ctx.font = 'bold 9px monospace';
        var label = isBlinking ? '✦ EVADING ✦' : 'LOSING THEM…';
        ctx.fillStyle = isBlinking ? '#ffdd44' : '#aa7700';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, boxX + boxW - 8, starBoxY + starBoxH / 2);
      }
    },

    // ── Weapon badge (bottom-left, on foot) ───────────────────────────────────
    renderWeaponBadge: function(ctx, player, timeSec) {
      var x = 28, y = 712, w = 185, h = 64;
      var weapons = VC.Weapons;
      var def = weapons ? weapons.getDef() : null;
      var clip    = weapons ? weapons.state.clip    : 0;
      var reserve = weapons ? weapons.state.reserve : 0;
      var reloading = weapons ? weapons.state.reloading : false;
      var cooldown  = weapons ? weapons.state.fireCooldown : 0;

      ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
      ctx.strokeStyle = reloading ? '#ffaa00' : 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = reloading ? 2 : 1.5;
      VC.roundRect(ctx, x, y, w, h, 6);
      ctx.fill(); ctx.stroke();

      var weapName = def ? def.display : 'UNARMED';
      VC.drawGlowText(ctx, weapName, x + 14, y + 20, 'bold 15px "Courier New", monospace',
        '#00f0ff', 'rgba(0,240,255,0.6)', 6, 'left');

      // Ammo display
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '11px monospace';
      if (def && def.clipSize === Infinity) {
        ctx.fillStyle = '#8aa0b8';
        ctx.fillText('UNARMED  [LMB]', x + 14, y + 42);
      } else if (reloading) {
        ctx.fillStyle = '#ffaa00';
        ctx.fillText('RELOADING...', x + 14, y + 42);
      } else {
        // Clip dots
        var clipSize = def ? def.clipSize : 0;
        var dotSpacing = Math.min(10, (w - 28) / Math.max(1, clipSize));
        for (var i = 0; i < clipSize && i < 20; i++) {
          var filled = i < clip;
          ctx.fillStyle = filled ? '#00f0ff' : '#1a2534';
          ctx.beginPath();
          ctx.arc(x + 14 + i * dotSpacing, y + 48, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // Numeric reserve
        ctx.fillStyle = '#6a8099';
        ctx.font = '10px monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(clip + ' | ' + reserve, x + 14, y + 62);
      }

      // Reload hint
      if (!reloading && def && def.clipSize !== Infinity && clip < def.clipSize) {
        ctx.fillStyle = '#557788';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('[R] RELOAD', x + w - 8, y + 62);
      }
    },

    // ── Vehicle dashboard ─────────────────────────────────────────────────────
    renderVehicleDashboard: function(ctx, vehicle, timeSec) {
      var x = 28, y = 690, w = 270, h = 86;
      ctx.save();
      ctx.fillStyle = 'rgba(8, 14, 24, 0.88)';
      ctx.strokeStyle = vehicle.damageFlash > 0 ? '#ff1744' : 'rgba(0,240,255,0.45)';
      ctx.lineWidth = vehicle.damageFlash > 0 ? 2 : 1.5;
      VC.roundRect(ctx, x, y, w, h, 6);
      ctx.fill(); ctx.stroke();

      var title = (vehicle.typeName || 'VEHICLE').toUpperCase() + ' // ' + (vehicle.carClass || 'CRUISER').toUpperCase();
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, x + 14, y + 12);

      var kmh = vehicle.getSpeedKmH ? vehicle.getSpeedKmH() : Math.round(Math.abs(vehicle.speed) * 0.42);
      VC.drawGlowText(ctx, kmh + ' KM/H', x + 14, y + 42, 'bold 22px "Courier New", monospace',
        '#ffffff', 'rgba(0,240,255,0.65)', 8, 'left');

      ctx.font = 'bold 10px monospace';
      ctx.textBaseline = 'middle';
      if (vehicle.isBoosting)       { ctx.fillStyle = '#39ff14'; ctx.fillText('NITRO BOOST', x + 155, y + 42); }
      else if (vehicle.isDrifting)  { ctx.fillStyle = '#ffaa00'; ctx.fillText('DRIFTING',    x + 155, y + 42); }
      else if (vehicle.isBraking)   { ctx.fillStyle = '#ff2244'; ctx.fillText('BRAKING',     x + 155, y + 42); }
      else                          { ctx.fillStyle = '#657b92'; ctx.fillText('CRUISE',      x + 155, y + 42); }

      var barX = x + 14, barY = y + 60, barW = w - 28, barH = 7;
      var hpRatio = Math.max(0, vehicle.health / vehicle.maxHealth);
      var barColor = hpRatio < 0.35 ? (Math.sin((timeSec || 0) * 10) > 0 ? '#ff1744' : '#b71c1c')
                   : hpRatio < 0.70 ? '#f5b041' : '#00e676';
      ctx.fillStyle = '#101622'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = barColor;  ctx.fillRect(barX, barY, barW * hpRatio, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.strokeRect(barX, barY, barW, barH);

      ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#8aa0b8';
      ctx.textBaseline = 'top';
      ctx.fillText('CONDITION ' + Math.ceil(hpRatio * 100) + '%', barX, barY + barH + 3);
      ctx.fillStyle = '#657b92'; ctx.textAlign = 'right';
      ctx.fillText('[F] EXIT', x + w - 14, barY + barH + 3);

      ctx.restore();
    },

    renderVehiclePrompt: function(ctx, nearVehicle) {
      var cx = 640, cy = 735, w = 340, h = 36, x = cx - w / 2, y = cy - h / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(6,12,22,0.90)';
      ctx.strokeStyle = '#ffea00'; ctx.lineWidth = 1.5;
      VC.roundRect(ctx, x, y, w, h, 6); ctx.fill(); ctx.stroke();
      var vehName = (nearVehicle.typeName || nearVehicle.name || 'VEHICLE').toUpperCase();
      VC.drawGlowText(ctx, 'PRESS F TO TAKE THE ' + vehName, cx, cy,
        'bold 13px "Courier New", monospace', '#ffea00', 'rgba(255,234,0,0.7)', 10, 'center');
      ctx.restore();
    },

    // ── Mission tracker (upper-center) ───────────────────────────────────────
    renderMissionTracker: function(ctx, timeSec) {
      var w = 360, h = 50, x = 640 - w / 2, y = 24;

      ctx.fillStyle = 'rgba(6,12,20,0.82)';
      ctx.strokeStyle = 'rgba(255,170,0,0.4)';
      ctx.lineWidth = 1.2;
      VC.roundRect(ctx, x, y, w, h, 5);
      ctx.fill(); ctx.stroke();

      ctx.textAlign = 'left'; ctx.textBaseline = 'top';

      if (VC.Missions && VC.Missions.state.active) {
        var m = VC.Missions.getMission();
        var obj = VC.Missions.getObjective();
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = '#ffaa00';
        ctx.fillText('\u25c6 ' + (m ? m.title.toUpperCase() : 'MISSION'), x + 12, y + 8);
        ctx.font = '11px "Courier New", monospace';
        ctx.fillStyle = '#d0deee';
        ctx.fillText(obj ? obj.label : 'Complete objectives', x + 12, y + 28);
      } else {
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = '#ffaa00';
        ctx.fillText('MISSION:', x + 12, y + 8);
        ctx.font = '11px "Courier New", monospace';
        ctx.fillStyle = '#d0deee';
        // Show next available mission hint
        if (VC.Missions && VC.Missions.getMission()) {
          var nm = VC.Missions.getMission();
          ctx.fillText('Go to mission marker \u2014 ' + nm.title, x + 12, y + 28);
        } else {
          ctx.fillText('Free roam \u2014 press M for map', x + 12, y + 28);
        }
      }
    },

    // ── Crosshair ────────────────────────────────────────────────────────────
    renderCrosshair: function(ctx) {
      if (!VC.Input || !VC.Input.mouse) return;
      var mx = VC.Input.mouse.screenX, my = VC.Input.mouse.screenY;
      var weapons = VC.Weapons;
      var spread = weapons ? weapons.getDef().spread : 0.06;
      var innerR = 8 + spread * 50;

      ctx.save();
      ctx.strokeStyle = 'rgba(0,240,255,0.85)'; ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0,240,255,0.6)'; ctx.shadowBlur = 6;

      ctx.beginPath(); ctx.arc(mx, my, innerR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();

      var gap = innerR + 1, len = 6;
      ctx.beginPath();
      ctx.moveTo(mx - gap - len, my); ctx.lineTo(mx - gap, my);
      ctx.moveTo(mx + gap, my);       ctx.lineTo(mx + gap + len, my);
      ctx.moveTo(mx, my - gap - len); ctx.lineTo(mx, my - gap);
      ctx.moveTo(mx, my + gap);       ctx.lineTo(mx, my + gap + len);
      ctx.stroke();
      ctx.restore();
    },

    // ── Toasts ────────────────────────────────────────────────────────────────
    renderToasts: function(ctx) {
      var startY = 110, rightX = 1252;
      for (var i = 0; i < toasts.length; i++) {
        var t = toasts[i];
        var alpha = Math.min(1, t.time / 0.5);
        var tw = 260, th = 32, tx = rightX - tw, ty = startY + i * 40;
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(10,16,26,0.9)'; ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.5;
        VC.roundRect(ctx, tx, ty, tw, th, 4); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 12px "Courier New", monospace'; ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t.text, tx + tw / 2, ty + th / 2);
        ctx.restore();
      }
    },

    // ── Radio banner (above minimap, with a 17px vertical gap) ───────────────
    renderRadioBanner: function(ctx, timeSec) {
      var rx = 1252, ry = 550, rw = 240, rh = 42, x = rx - rw;
      var station = RADIO_STATIONS[radioIndex];
      ctx.save();
      ctx.fillStyle = 'rgba(6,10,18,0.78)';
      ctx.strokeStyle = 'rgba(255,100,200,0.3)';
      ctx.lineWidth = 1;
      VC.roundRect(ctx, x, ry, rw, rh, 4);
      ctx.fill(); ctx.stroke();

      ctx.font = 'bold 10px "Courier New", monospace';
      ctx.fillStyle = '#ff88cc';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('\u266b ' + station.station, x + 10, ry + 6);

      // Scroll the track name
      var trackText = station.track;
      var elapsed = RADIO_INTERVAL - radioTimer;
      var scrollPos = Math.max(0, (elapsed - 2) * 28) % (trackText.length * 7 + 100);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#cc88aa';
      ctx.textBaseline = 'top';

      ctx.save();
      ctx.rect(x + 8, ry + 22, rw - 16, 14);
      ctx.clip();
      ctx.fillText(trackText, x + 10 - scrollPos, ry + 24);
      ctx.restore();

      ctx.restore();
    },

    // ── GAME SAVED toast (center) ────────────────────────────────────────────
    renderSavedToast: function(ctx, timer) {
      var alpha = Math.min(1, timer / 0.5);
      var tw = 240, th = 38, tx = 640 - tw / 2, ty = 760 - th;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,30,10,0.95)';
      ctx.strokeStyle = '#39ff14'; ctx.lineWidth = 2;
      VC.roundRect(ctx, tx, ty, tw, th, 6); ctx.fill(); ctx.stroke();
      ctx.font = 'bold 15px "Courier New", monospace'; ctx.fillStyle = '#39ff14';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('\u2713 GAME SAVED', 640, ty + th / 2);
      ctx.restore();
    },

    // ── Mission complete banner ───────────────────────────────────────────────
    renderMissionBanner: function(ctx, banner, timeSec) {
      var t = banner.timer;
      var totalTime = 5.0;
      var alpha = t > totalTime - 0.5 ? (totalTime - t) / 0.5
                : t < 0.6             ? t / 0.6
                : 1;

      ctx.save(); ctx.globalAlpha = alpha;
      var bw = 580, bh = 90, bx = (1280 - bw) / 2, by = 310;

      ctx.fillStyle = 'rgba(4,8,16,0.95)';
      ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 2.5;
      VC.roundRect(ctx, bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();

      VC.drawGlowText(ctx, 'MISSION COMPLETE', 640, by + 30, 'bold 28px "Courier New", monospace',
        '#ffaa00', 'rgba(255,170,0,0.8)', 18, 'center');

      ctx.font = 'bold 18px "Courier New", monospace'; ctx.fillStyle = '#d0deee';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(banner.title, 640, by + 58);

      ctx.font = 'bold 16px "Courier New", monospace'; ctx.fillStyle = '#39ff14';
      ctx.fillText('+$' + banner.reward, 640, by + 78);

      ctx.restore();
    },

    // ── Mission briefing dialog ───────────────────────────────────────────────
    renderMissionDialog: function(ctx, dialog, timeSec) {
      var t = dialog.timer;
      var alpha = t > 6.0 ? (6.5 - t) / 0.5 : t < 0.6 ? t / 0.6 : 1;

      ctx.save(); ctx.globalAlpha = alpha;
      var dw = 680, dh = 110, dx = (1280 - dw) / 2, dy = 560;

      ctx.fillStyle = 'rgba(2,8,18,0.96)';
      ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 2;
      VC.roundRect(ctx, dx, dy, dw, dh, 8); ctx.fill(); ctx.stroke();

      ctx.font = 'bold 14px "Courier New", monospace'; ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('\u25c6 MISSION: ' + dialog.title.toUpperCase(), dx + 18, dy + 14);

      // Typewriter effect for briefing text
      var charsToShow = Math.floor(((6.5 - t) / 6.5) * dialog.text.length * 2.2);
      var displayText = dialog.text.substring(0, Math.min(dialog.text.length, charsToShow));
      ctx.font = '13px "Courier New", monospace'; ctx.fillStyle = '#d0deee';
      ctx.fillText(displayText, dx + 18, dy + 36);

      ctx.font = '10px monospace'; ctx.fillStyle = '#556677';
      ctx.textAlign = 'right';
      ctx.fillText('[SPACE] Skip briefing', dx + dw - 14, dy + dh - 14);

      ctx.restore();
    },

    // ── Full map overlay ──────────────────────────────────────────────────────
    renderMapOverlay: function(ctx, player, city) {
      if (!city) return;
      ctx.save();
      ctx.fillStyle = 'rgba(2,6,12,0.88)'; ctx.fillRect(0, 0, 1280, 800);

      VC.drawGlowText(ctx, 'VIREO CITY // SATELLITE MAP', 640, 50,
        'bold 22px "Courier New", monospace', '#00f0ff', 'rgba(0,240,255,0.7)', 10, 'center');

      var mapW = 680, mapH = 620, mapX = (1280 - mapW) / 2, mapY = 85;
      ctx.fillStyle = '#060c14'; ctx.strokeStyle = 'rgba(0,240,255,0.5)'; ctx.lineWidth = 2;
      ctx.fillRect(mapX, mapY, mapW, mapH); ctx.strokeRect(mapX, mapY, mapW, mapH);

      var scaleX = mapW / city.worldWidth, scaleY = mapH / city.worldHeight;

      if (city.waterfront) {
        ctx.fillStyle = '#0a2238';
        ctx.fillRect(mapX + city.waterfront.x * scaleX, mapY,
          (city.worldWidth - city.waterfront.x) * scaleX, mapH);
      }
      if (city.pier) {
        ctx.fillStyle = '#5c4535';
        ctx.fillRect(mapX + city.pier.x * scaleX, mapY + city.pier.y * scaleY,
          city.pier.width * scaleX, city.pier.height * scaleY);
      }
      for (var b = 0; b < city.blocks.length; b++) {
        var blk = city.blocks[b];
        ctx.fillStyle = blk.type === 'park' ? '#11402a' : blk.type === 'parking' ? '#1e2838' : '#222d40';
        ctx.fillRect(mapX + blk.x * scaleX, mapY + blk.y * scaleY, blk.w * scaleX, blk.h * scaleY);
        ctx.strokeStyle = '#32415c';
        ctx.strokeRect(mapX + blk.x * scaleX, mapY + blk.y * scaleY, blk.w * scaleX, blk.h * scaleY);
      }

      // Mission marker on map
      if (VC.Missions && VC.Missions.state.active) {
        var obj = VC.Missions.getObjective();
        if (obj && obj.x !== undefined) {
          var mmx = mapX + obj.x * scaleX, mmy = mapY + obj.y * scaleY;
          ctx.fillStyle = '#ffaa00'; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(mmx, mmy, 5, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      var px = mapX + player.x * scaleX, py = mapY + player.y * scaleY;
      ctx.fillStyle = '#ffeb3b'; ctx.shadowColor = '#ffeb3b'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = '13px monospace'; ctx.fillStyle = '#8aa0b8';
      ctx.textAlign = 'center';
      ctx.fillText('[ Press TAB or M to close map ]', 640, 740);
      ctx.restore();
    }
  };

  VC.hud = HUD;
})();
