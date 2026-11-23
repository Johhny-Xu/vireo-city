// Tactical radar minimap widget and full-screen satellite map for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var MINIMAP_RADIUS = 76;
  var MINIMAP_CENTER_X = 1170;
  var MINIMAP_CENTER_Y = 685;
  var WORLD_RANGE = 420; // world units radius shown in minimap

  function drawRotatedArrow(ctx, x, y, angle, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = color || '#ffd700';
    ctx.shadowColor = color || '#ffd700';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(size * 1.2, 0);
    ctx.lineTo(-size * 0.7, -size * 0.7);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.7, size * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  var Minimap = {
    radarSweepAngle: 0,

    update: function(dt) {
      this.radarSweepAngle = (this.radarSweepAngle + dt * 2.2) % (Math.PI * 2);
    },

    render: function(ctx, player, city, gameTime) {
      if (!player || !city) return;

      var cx = MINIMAP_CENTER_X;
      var cy = MINIMAP_CENTER_Y;
      var r = MINIMAP_RADIUS;
      var scale = r / WORLD_RANGE;

      ctx.save();

      // 1. Radar Backdrop
      ctx.fillStyle = 'rgba(6, 12, 22, 0.90)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Clip inside the radar circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.clip();

      var focusX = player.vehicle ? player.vehicle.x : player.x;
      var focusY = player.vehicle ? player.vehicle.y : player.y;

      // Draw City Blocks
      for (var b = 0; b < city.blocks.length; b++) {
        var blk = city.blocks[b];
        var bbx = cx + (blk.x - focusX) * scale;
        var bby = cy + (blk.y - focusY) * scale;
        var bbw = blk.w * scale;
        var bbh = blk.h * scale;

        if (bbx + bbw < cx - r || bbx > cx + r || bby + bbh < cy - r || bby > cy + r) continue;

        if (blk.type === 'park') {
          ctx.fillStyle = '#0a2e1d';
        } else if (blk.type === 'parking') {
          ctx.fillStyle = '#162232';
        } else {
          ctx.fillStyle = '#182436';
        }
        ctx.fillRect(bbx, bby, bbw, bbh);
      }

      // Draw Roads
      ctx.fillStyle = '#28384d';
      for (var rd = 0; rd < city.roads.length; rd++) {
        var road = city.roads[rd];
        var rdx = cx + (road.x - focusX) * scale;
        var rdy = cy + (road.y - focusY) * scale;
        var rdw = road.w * scale;
        var rdh = road.h * scale;

        if (rdx + rdw < cx - r || rdx > cx + r || rdy + rdh < cy - r || rdy > cy + r) continue;
        ctx.fillRect(rdx, rdy, rdw, rdh);
      }

      // Draw Ocean & Pier if in range
      if (city.waterfront) {
        var wfx = cx + (city.waterfront.x - focusX) * scale;
        if (wfx < cx + r) {
          ctx.fillStyle = '#09253d';
          ctx.fillRect(wfx, cy - r, (city.worldWidth - city.waterfront.x) * scale, r * 2);
        }
      }

      // Draw Parked Cars (subtle slate blue dots)
      ctx.fillStyle = '#486280';
      for (var pc = 0; pc < city.parkedCars.length; pc++) {
        var car = city.parkedCars[pc];
        var pcx = cx + (car.x - focusX) * scale;
        var pcy = cy + (car.y - focusY) * scale;
        if (Math.hypot(pcx - cx, pcy - cy) < r - 4) {
          ctx.fillRect(pcx - 1.5, pcy - 1.5, 3, 3);
        }
      }

      // Draw Pedestrians (faint white/cyan pips)
      if (VC.pedestrians && VC.pedestrians.pedestrians) {
        ctx.fillStyle = 'rgba(200, 240, 255, 0.7)';
        var peds = VC.pedestrians.pedestrians;
        for (var p = 0; p < peds.length; p++) {
          var ped = peds[p];
          var pdx = cx + (ped.x - focusX) * scale;
          var pdy = cy + (ped.y - focusY) * scale;
          if (Math.hypot(pdx - cx, pdy - cy) < r - 4) {
            ctx.fillRect(pdx - 1, pdy - 1, 2, 2);
          }
        }
      }

      // Draw Traffic Cars & Police
      if (VC.traffic && VC.traffic.vehicles) {
        var tcars = VC.traffic.vehicles;
        for (var t = 0; t < tcars.length; t++) {
          var tv = tcars[t].vehicle;
          if (tv === player.vehicle) continue;

          var tvx = cx + (tv.x - focusX) * scale;
          var tvy = cy + (tv.y - focusY) * scale;

          if (Math.hypot(tvx - cx, tvy - cy) < r - 4) {
            if (tv.typeKey === 'interceptor') {
              // Police cruiser: flashing red/blue blip
              var strobe = Math.sin((gameTime || 0) * 12) > 0;
              ctx.fillStyle = strobe ? '#ff1744' : '#00e5ff';
              ctx.beginPath();
              ctx.arc(tvx, tvy, 3.5, 0, Math.PI * 2);
              ctx.fill();
            } else {
              // Civilian traffic: amber / cyan blip
              ctx.fillStyle = tv.typeKey === 'cab' ? '#ffd700' : '#00e5ff';
              ctx.fillRect(tvx - 2, tvy - 2, 4, 4);
            }
          }
        }
      }

      // VPD AIR ONE: dedicated helicopter blip with an altitude badge
      if (VC.PoliceAir && VC.PoliceAir.active) {
        var ahx = cx + (VC.PoliceAir.x - focusX) * scale;
        var ahy = cy + (VC.PoliceAir.y - focusY) * scale;
        if (Math.hypot(ahx - cx, ahy - cy) < r - 4) {
          ctx.save();
          ctx.fillStyle = '#ff2244';
          ctx.shadowColor = '#ff2244';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(ahx, ahy - 7);
          ctx.lineTo(ahx + 7, ahy + 6);
          ctx.lineTo(ahx - 7, ahy + 6);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#e8f5ff';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('A1 ' + (VC.PoliceAir.altitude || 280) + 'ft', ahx, ahy + 7);
          ctx.restore();
        }
      }

      // Draw Mission Marker (pulsing gold/orange diamond)
      var missionX = 1420;
      var missionY = 705;
      var mdx = cx + (missionX - focusX) * scale;
      var mdy = cy + (missionY - focusY) * scale;
      if (Math.hypot(mdx - cx, mdy - cy) < r - 6) {
        var mPulse = 3.5 + Math.sin((gameTime || 0) * 6) * 1.5;
        ctx.save();
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(mdx, mdy - mPulse);
        ctx.lineTo(mdx + mPulse, mdy);
        ctx.lineTo(mdx, mdy + mPulse);
        ctx.lineTo(mdx - mPulse, mdy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Concentric Radar Rings & Crosshair
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
      ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Subtle Radar Sweep Beam
      var sweepGrad = ctx.createLinearGradient(
        cx, cy,
        cx + Math.cos(this.radarSweepAngle) * r,
        cy + Math.sin(this.radarSweepAngle) * r
      );
      sweepGrad.addColorStop(0, 'rgba(0, 240, 255, 0.3)');
      sweepGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, this.radarSweepAngle - 0.4, this.radarSweepAngle);
      ctx.closePath();
      ctx.fill();

      // Draw Player Arrow in Center
      var playerAngle = player.vehicle ? player.vehicle.heading : player.facing;
      drawRotatedArrow(ctx, cx, cy, playerAngle, 7, '#ffeb3b');

      ctx.restore(); // restore clip

      // 2. Cyber Bezel Frame
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Outer bezel tick marks
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1.5;
      for (var a = 0; a < 8; a++) {
        var tickAngle = (a / 8) * Math.PI * 2;
        var cosA = Math.cos(tickAngle);
        var sinA = Math.sin(tickAngle);
        ctx.beginPath();
        ctx.moveTo(cx + cosA * (r - 2), cy + sinA * (r - 2));
        ctx.lineTo(cx + cosA * (r + 4), cy + sinA * (r + 4));
        ctx.stroke();
      }

      // North "N" Indicator badge
      ctx.fillStyle = 'rgba(10, 16, 26, 0.95)';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.2;
      VC.roundRect(ctx, cx - 8, cy - r - 12, 16, 14, 3);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 9px "Courier New", monospace';
      ctx.fillStyle = '#00f0ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', cx, cy - r - 5);

      // District Tag
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#8aa0b8';
      ctx.textAlign = 'center';
      ctx.fillText('OCEAN AVE', cx, cy + r + 14);

      ctx.restore();
    },

    renderFullMap: function(ctx, player, city) {
      if (!city) return;

      ctx.save();
      // Backdrop
      ctx.fillStyle = 'rgba(2, 6, 12, 0.92)';
      ctx.fillRect(0, 0, 1280, 800);

      // Header Banner
      VC.drawGlowText(
        ctx,
        'VIREO CITY // SATELLITE TACTICAL MAP',
        640,
        45,
        'bold 22px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.8)',
        12,
        'center'
      );

      // Map Viewport Frame
      var mapW = 740;
      var mapH = 600;
      var mapX = (1280 - mapW) / 2;
      var mapY = 75;

      ctx.fillStyle = '#050a12';
      ctx.fillRect(mapX, mapY, mapW, mapH);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(mapX, mapY, mapW, mapH);

      var scaleX = mapW / city.worldWidth;
      var scaleY = mapH / city.worldHeight;

      // Draw Waterfront
      if (city.waterfront) {
        ctx.fillStyle = '#092238';
        ctx.fillRect(
          mapX + city.waterfront.x * scaleX,
          mapY,
          (city.worldWidth - city.waterfront.x) * scaleX,
          mapH
        );
      }

      // Draw Pier
      if (city.pier) {
        ctx.fillStyle = '#5c4535';
        ctx.fillRect(
          mapX + city.pier.x * scaleX,
          mapY + city.pier.y * scaleY,
          city.pier.width * scaleX,
          city.pier.height * scaleY
        );
      }

      // Draw City Blocks
      for (var b = 0; b < city.blocks.length; b++) {
        var blk = city.blocks[b];
        var bx = mapX + blk.x * scaleX;
        var by = mapY + blk.y * scaleY;
        var bw = blk.w * scaleX;
        var bh = blk.h * scaleY;

        if (blk.type === 'park') {
          ctx.fillStyle = '#11442a';
        } else if (blk.type === 'parking') {
          ctx.fillStyle = '#182436';
        } else {
          ctx.fillStyle = '#202b3d';
        }
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#2f3e58';
        ctx.strokeRect(bx, by, bw, bh);
      }

      // Draw Roads
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (var r = 0; r < city.roads.length; r++) {
        var rd = city.roads[r];
        ctx.strokeRect(
          mapX + rd.x * scaleX,
          mapY + rd.y * scaleY,
          rd.w * scaleX,
          rd.h * scaleY
        );
      }

      // Draw Traffic Blips
      if (VC.traffic && VC.traffic.vehicles) {
        for (var t = 0; t < VC.traffic.vehicles.length; t++) {
          var tv = VC.traffic.vehicles[t].vehicle;
          var tx = mapX + tv.x * scaleX;
          var ty = mapY + tv.y * scaleY;
          ctx.fillStyle = tv.typeKey === 'interceptor' ? '#ff1744' : '#00e5ff';
          ctx.beginPath();
          ctx.arc(tx, ty, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (VC.PoliceAir && VC.PoliceAir.active) {
        var fax = mapX + VC.PoliceAir.x * scaleX;
        var fay = mapY + VC.PoliceAir.y * scaleY;
        ctx.fillStyle = '#ff2244';
        ctx.shadowColor = '#ff2244';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(fax, fay - 8);
        ctx.lineTo(fax + 8, fay + 7);
        ctx.lineTo(fax - 8, fay + 7);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffccd5';
        ctx.fillText('AIR ONE ' + VC.PoliceAir.altitude + 'ft', fax, fay + 11);
      }

      // Draw Mission Objective
      var mObjX = mapX + 1420 * scaleX;
      var mObjY = mapY + 705 * scaleY;
      ctx.fillStyle = '#ffaa00';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(mObjX, mObjY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Player Position Arrow
      var px = mapX + (player.vehicle ? player.vehicle.x : player.x) * scaleX;
      var py = mapY + (player.vehicle ? player.vehicle.y : player.y) * scaleY;
      var pAngle = player.vehicle ? player.vehicle.heading : player.facing;
      drawRotatedArrow(ctx, px, py, pAngle, 8, '#ffeb3b');

      // Legend & Instructions
      var legendY = mapY + mapH + 16;
      ctx.font = '12px "Courier New", monospace';
      ctx.fillStyle = '#ffeb3b'; ctx.fillText('▲ Player', mapX + 10, legendY);
      ctx.fillStyle = '#00e5ff'; ctx.fillText('● Traffic', mapX + 120, legendY);
      ctx.fillStyle = '#ff1744'; ctx.fillText('● Police', mapX + 220, legendY);
      ctx.fillStyle = '#ffaa00'; ctx.fillText('★ Objective', mapX + 320, legendY);
      ctx.fillStyle = '#11a055'; ctx.fillText('■ Vireo Park', mapX + 440, legendY);

      ctx.fillStyle = '#8aa0b8';
      ctx.textAlign = 'right';
      ctx.fillText('[ Press TAB or M to Return to Game ]', mapX + mapW, legendY);

      ctx.restore();
    }
  };

  VC.minimap = Minimap;
  VC.Minimap = Minimap;
})();