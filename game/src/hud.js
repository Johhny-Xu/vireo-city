// Heads-Up Display (HUD) and tactical reticle for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var toasts = [];
  var showFullMap = false;

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
      toasts.push({
        text: message,
        time: duration || 3.0,
        maxTime: duration || 3.0
      });
      if (toasts.length > 5) toasts.shift();
    },

    toggleMap: function() {
      showFullMap = !showFullMap;
      return showFullMap;
    },

    isMapOpen: function() {
      return showFullMap;
    },

    update: function(dt) {
      for (var i = toasts.length - 1; i >= 0; i--) {
        toasts[i].time -= dt;
        if (toasts[i].time <= 0) {
          toasts.splice(i, 1);
        }
      }

      // Check map toggle keys (Tab or M)
      if (VC.Input && (VC.Input.justPressed('Tab') || VC.Input.justPressed('KeyM'))) {
        this.toggleMap();
        if (VC.Audio) VC.Audio.uiBlip(880);
      }
    },

    render: function(ctx, player, city, timeSec) {
      if (!player) return;

      ctx.save();

      // 1. Top-Left: Player Identity & Health / Armor bars
      this.renderPlayerStatus(ctx, player, timeSec);

      // 2. Top-Right: Cash Counter, Clock & Wanted Stars
      this.renderTopRight(ctx, player, timeSec);

      // 3. Bottom-Left: Weapon Status Badge
      this.renderWeaponBadge(ctx, player);

      // 4. Upper-Center: Mission Tracker Panel
      this.renderMissionTracker(ctx);

      // 5. Center: Crosshair
      this.renderCrosshair(ctx);

      // 6. Toasts (Right-Center floating notifications)
      this.renderToasts(ctx);

      // 7. Full Map Overlay (if toggled)
      if (showFullMap) {
        this.renderMapOverlay(ctx, player, city);
      }

      ctx.restore();
    },

    renderPlayerStatus: function(ctx, player, timeSec) {
      var x = 28;
      var y = 24;

      // Character badge background
      ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1.5;
      VC.roundRect(ctx, x, y, 224, 62, 5);
      ctx.fill();
      ctx.stroke();

      // Protagonist name
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.fillText('V. CROSS // VIREO CITY', x + 10, y + 16);

      // Health Bar
      var hpRatio = Math.max(0, player.health / player.maxHealth);
      var hpW = 140;
      var hpH = 10;
      var hpX = x + 68;
      var hpY = y + 26;

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#8aa0b8';
      ctx.fillText('HEALTH', x + 10, hpY + 9);

      // HP background
      ctx.fillStyle = '#101620';
      ctx.fillRect(hpX, hpY, hpW, hpH);

      // HP Fill
      var isLowHp = player.health < 30;
      var hpFillColor = '#00e676';
      if (isLowHp) {
        var flash = Math.sin((timeSec || 0) * 12) > 0;
        hpFillColor = flash ? '#ff1744' : '#b71c1c';
      }
      ctx.fillStyle = hpFillColor;
      ctx.fillRect(hpX, hpY, hpW * hpRatio, hpH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.strokeRect(hpX, hpY, hpW, hpH);

      // Armor Bar
      var arRatio = Math.max(0, player.armor / player.maxArmor);
      var arH = 6;
      var arY = y + 42;

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#8aa0b8';
      ctx.fillText('ARMOR', x + 10, arY + 6);

      ctx.fillStyle = '#101620';
      ctx.fillRect(hpX, arY, hpW, arH);
      ctx.fillStyle = '#00b0ff';
      ctx.fillRect(hpX, arY, hpW * arRatio, arH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeRect(hpX, arY, hpW, arH);
    },

    renderTopRight: function(ctx, player, timeSec) {
      var rightX = 1252;
      var y = 24;

      // Cash Counter Box
      var boxW = 210;
      var boxH = 44;
      var boxX = rightX - boxW;

      ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.35)';
      ctx.lineWidth = 1.5;
      VC.roundRect(ctx, boxX, y, boxW, boxH, 5);
      ctx.fill();
      ctx.stroke();

      // Digital cash text: $000,000,250 format
      var cashNum = Math.floor(player.cash);
      var cashStr = '$' + ('00000000' + cashNum).slice(-8);
      // Insert commas: $00,000,250
      cashStr = cashStr.slice(0, 3) + ',' + cashStr.slice(3, 6) + ',' + cashStr.slice(6);

      VC.drawGlowText(
        ctx,
        cashStr,
        boxX + boxW / 2,
        y + 22,
        'bold 20px "Courier New", monospace',
        '#39ff14',
        'rgba(57, 255, 20, 0.5)',
        8,
        'center'
      );

      // Wanted Stars
      var starBoxY = y + 52;
      var starBoxH = 26;
      ctx.fillStyle = 'rgba(8, 14, 24, 0.82)';
      ctx.strokeStyle = player.wantedLevel > 0 ? 'rgba(255, 34, 68, 0.6)' : 'rgba(100, 120, 150, 0.25)';
      VC.roundRect(ctx, boxX, starBoxY, boxW, starBoxH, 4);
      ctx.fill();
      ctx.stroke();

      for (var s = 0; s < 5; s++) {
        var sx = boxX + 24 + s * 38;
        var sy = starBoxY + starBoxH / 2;
        var isActive = s < player.wantedLevel;

        drawStar(ctx, sx, sy, 5, 9, 4.5);
        if (isActive) {
          var pulse = Math.sin((timeSec || 0) * 8) > 0;
          ctx.fillStyle = pulse ? '#ff2244' : '#ffaa00';
          ctx.shadowColor = '#ff2244';
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.strokeStyle = '#3a4759';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    },

    renderWeaponBadge: function(ctx, player) {
      var x = 28;
      var y = 718;
      var w = 150;
      var h = 58;

      ctx.fillStyle = 'rgba(8, 14, 24, 0.85)';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1.5;
      VC.roundRect(ctx, x, y, w, h, 6);
      ctx.fill();
      ctx.stroke();

      // Weapon name & type
      VC.drawGlowText(
        ctx,
        player.weapon,
        x + 14,
        y + 22,
        'bold 15px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.6)',
        6,
        'left'
      );

      ctx.font = '11px monospace';
      ctx.fillStyle = '#8aa0b8';
      ctx.fillText(player.weapon === 'UNARMED' ? 'FISTS [READY]' : 'AMMO: ∞', x + 14, y + 42);
    },

    renderMissionTracker: function(ctx) {
      var w = 340;
      var h = 34;
      var x = 640 - w / 2;
      var y = 24;

      ctx.fillStyle = 'rgba(6, 12, 20, 0.82)';
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.4)';
      ctx.lineWidth = 1.2;
      VC.roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
      ctx.stroke();

      // Mission tracker label & body
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.fillStyle = '#ffaa00';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('MISSION:', x + 12, y + h / 2);

      ctx.font = '12px "Courier New", monospace';
      ctx.fillStyle = '#e0ecf8';
      ctx.fillText('Free roam — press M for the map', x + 82, y + h / 2);
    },

    renderCrosshair: function(ctx) {
      if (!VC.Input || !VC.Input.mouse) return;
      var mx = VC.Input.mouse.screenX;
      var my = VC.Input.mouse.screenY;

      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
      ctx.shadowBlur = 6;

      // Outer ring
      ctx.beginPath();
      ctx.arc(mx, my, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 4 Pips
      ctx.beginPath();
      ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 9, my);
      ctx.moveTo(mx + 9, my);  ctx.lineTo(mx + 14, my);
      ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 9);
      ctx.moveTo(mx, my + 9);  ctx.lineTo(mx, my + 14);
      ctx.stroke();

      ctx.restore();
    },

    renderToasts: function(ctx) {
      var startY = 110;
      var rightX = 1252;

      for (var i = 0; i < toasts.length; i++) {
        var t = toasts[i];
        var alpha = Math.min(1, t.time / 0.5);
        var tw = 240;
        var th = 32;
        var tx = rightX - tw;
        var ty = startY + i * 40;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(10, 16, 26, 0.9)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        VC.roundRect(ctx, tx, ty, tw, th, 4);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.text, tx + tw / 2, ty + th / 2);
        ctx.restore();
      }
    },

    renderMapOverlay: function(ctx, player, city) {
      if (!city) return;

      ctx.save();
      // Backdrop
      ctx.fillStyle = 'rgba(2, 6, 12, 0.88)';
      ctx.fillRect(0, 0, 1280, 800);

      // Title
      VC.drawGlowText(
        ctx,
        'VIREO CITY // SATELLITE MAP',
        640,
        50,
        'bold 22px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.7)',
        10,
        'center'
      );

      // Map frame
      var mapW = 680;
      var mapH = 620;
      var mapX = (1280 - mapW) / 2;
      var mapY = 85;

      ctx.fillStyle = '#060c14';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.fillRect(mapX, mapY, mapW, mapH);
      ctx.strokeRect(mapX, mapY, mapW, mapH);

      // Scale factors from world coordinates to map rect
      var scaleX = mapW / city.worldWidth;
      var scaleY = mapH / city.worldHeight;

      // Draw ocean on right
      if (city.waterfront) {
        ctx.fillStyle = '#0a2238';
        ctx.fillRect(
          mapX + city.waterfront.x * scaleX,
          mapY,
          (city.worldWidth - city.waterfront.x) * scaleX,
          mapH
        );
      }

      // Draw pier
      if (city.pier) {
        ctx.fillStyle = '#5c4535';
        ctx.fillRect(
          mapX + city.pier.x * scaleX,
          mapY + city.pier.y * scaleY,
          city.pier.width * scaleX,
          city.pier.height * scaleY
        );
      }

      // Draw blocks
      for (var b = 0; b < city.blocks.length; b++) {
        var blk = city.blocks[b];
        var bx = mapX + blk.x * scaleX;
        var by = mapY + blk.y * scaleY;
        var bw = blk.w * scaleX;
        var bh = blk.h * scaleY;

        if (blk.type === 'park') {
          ctx.fillStyle = '#11402a';
        } else if (blk.type === 'parking') {
          ctx.fillStyle = '#1e2838';
        } else {
          ctx.fillStyle = '#222d40';
        }
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#32415c';
        ctx.strokeRect(bx, by, bw, bh);
      }

      // Draw Player icon (pulsing yellow dot)
      var px = mapX + player.x * scaleX;
      var py = mapY + player.y * scaleY;

      ctx.fillStyle = '#ffeb3b';
      ctx.shadowColor = '#ffeb3b';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Close hint
      ctx.font = '13px monospace';
      ctx.fillStyle = '#8aa0b8';
      ctx.textAlign = 'center';
      ctx.fillText('[ Press TAB or M to close map ]', 640, 740);

      ctx.restore();
    }
  };

  VC.hud = HUD;
})();
