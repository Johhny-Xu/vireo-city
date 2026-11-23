/*
 * Police aerial support: coordinates with police.js for wanted escalation,
 * minimap.js for the AIR ONE blip and hud.js for status/radio messages,
 * audio.js for the rotor hum, and weather.js by using existing storm/rain
 * atmosphere without changing its weather state or particles.
 */
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var active = false;
  var x = 0;
  var y = 0;
  var vx = 0;
  var vy = 0;
  var heading = 0;
  var pitch = 0;
  var roll = 0;
  var orbitAngle = 0;
  var orbitRadius = 210;
  var spotX = 0;
  var spotY = 0;
  var spotSwing = 0;
  var spotted = false;
  var concealed = false;
  var concealTimer = 0;
  var airSpotTimer = 0;
  var radioTimer = 0;
  var altitude = 280;
  var initialized = false;

  function playerPosition(player) {
    if (!player) return { x: 0, y: 0 };
    if (player.vehicle) return { x: player.vehicle.x, y: player.vehicle.y };
    return { x: player.x, y: player.y };
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function pointInTunnel(px, py, city) {
    if (!city || !city.tunnels) return false;
    for (var i = 0; i < city.tunnels.length; i++) {
      var t = city.tunnels[i];
      if (px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h) return true;
    }
    return false;
  }

  function pointInBuildingShadow(px, py, city) {
    if (!city || !city.buildings) return false;
    for (var i = 0; i < city.buildings.length; i++) {
      var b = city.buildings[i];
      var sh = b.shadowHeight || 30;
      if (px >= b.x - 12 && px <= b.x + b.w + sh * 0.6 + 12 &&
          py >= b.y - 12 && py <= b.y + b.h + sh + 12) return true;
    }
    return false;
  }

  function isConcealed(player, city) {
    var p = playerPosition(player);
    return pointInTunnel(p.x, p.y, city) || pointInBuildingShadow(p.x, p.y, city);
  }

  function drawRotor(ctx, cx, cy, radius, phase, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(phase);
    ctx.globalAlpha = 0.48;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.stroke();
    ctx.globalAlpha = 0.24;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  var PoliceAir = {
    get active() { return active; },
    get x() { return x; },
    get y() { return y; },
    get altitude() { return altitude; },
    get spotted() { return spotted; },
    get concealed() { return concealed; },
    get spotX() { return spotX; },
    get spotY() { return spotY; },

    seedOverhead: function(px, py, offset) {
      x = px + 210;
      y = py - 115;
      vx = 80;
      vy = 0;
      orbitAngle = offset || -0.55;
      spotX = px;
      spotY = py;
      spotted = true;
      radioTimer = 5.5;
      initialized = true;
      active = true;
    },

    update: function(dt, player, city, gameTime) {
      if (!player) return;
      var wanted = VC.wanted ? VC.wanted.level : (player.wantedLevel || 0);
      active = wanted >= 3;

      if (!active) {
        spotted = false;
        concealed = false;
        if (VC.Audio) VC.Audio.setHelicopterHum(false, 0);
        return;
      }

      var p = playerPosition(player);
      if (!initialized) {
        x = p.x + 210;
        y = p.y - 115;
        initialized = true;
      }

      orbitAngle += dt * 0.34;
      var targetOrbitX = p.x + Math.cos(orbitAngle) * orbitRadius;
      var targetOrbitY = p.y + Math.sin(orbitAngle) * orbitRadius * 0.58;
      var tx = targetOrbitX;
      var ty = targetOrbitY;
      var desiredHeading = Math.atan2(ty - y, tx - x);
      var turn = normalizeAngle(desiredHeading - heading);
      heading += turn * Math.min(1, dt * 2.1);

      var targetVx = Math.cos(desiredHeading) * 78;
      var targetVy = Math.sin(desiredHeading) * 58;
      vx += (targetVx - vx) * Math.min(1, dt * 1.8);
      vy += (targetVy - vy) * Math.min(1, dt * 1.8);
      x += vx * dt;
      y += vy * dt;
      x += (tx - x) * Math.min(1, dt * 0.9);
      y += (ty - y) * Math.min(1, dt * 0.9);

      pitch = Math.sin((gameTime || 0) * 1.7) * 0.08;
      roll += (Math.max(-0.18, Math.min(0.18, turn * 0.9)) - roll) * Math.min(1, dt * 3);

      spotSwing += dt * 1.15;
      var swingX = Math.sin(spotSwing) * 82 + Math.sin(spotSwing * 0.43) * 28;
      var swingY = Math.cos(spotSwing * 0.71) * 58;
      var targetSpotX = p.x + swingX;
      var targetSpotY = p.y + swingY;
      spotX += (targetSpotX - spotX) * Math.min(1, dt * 2.6);
      spotY += (targetSpotY - spotY) * Math.min(1, dt * 2.6);

      concealed = isConcealed(player, city);
      var dx = p.x - spotX;
      var dy = p.y - spotY;
      var insideEllipse = (dx * dx) / (98 * 98) + (dy * dy) / (58 * 58) <= 1;
      spotted = insideEllipse && !concealed;

      if (spotted) {
        concealTimer = 0;
        airSpotTimer += dt;
        if (VC.wanted) VC.wanted.registerPoliceSpot();
        if (airSpotTimer >= 4.2) {
          airSpotTimer = 0;
          var level = VC.wanted ? VC.wanted.level : (player.wantedLevel || wanted);
          if (level < 5) {
            if (VC.wanted) VC.wanted.setLevel(level + 1, player);
            else player.wantedLevel = level + 1;
            if (VC.hud) VC.hud.toast('AIR ONE IDENTIFIED YOU // WANTED ESCALATING', 2.2);
          }
        }
        if (radioTimer <= 0) radioTimer = 5.5;
      } else {
        airSpotTimer = Math.max(0, airSpotTimer - dt * 0.35);
        if (concealed) {
          concealTimer += dt;
        } else {
          concealTimer = Math.max(0, concealTimer - dt);
        }
      }
      radioTimer -= dt;
      if (radioTimer < -2) radioTimer = 0;

      var speed = Math.sqrt(vx * vx + vy * vy);
      if (VC.Audio) VC.Audio.setHelicopterHum(true, Math.min(1, speed / 90));
    },

    renderWorld: function(ctx, camera, player, gameTime) {
      if (!active || !player) return;
      ctx.save();

      // Moving elliptical searchlight pool on the ground
      ctx.translate(spotX, spotY);
      ctx.rotate(Math.atan2(spotY - y, spotX - x) * 0.12);
      var poolAlpha = concealed ? 0.16 : (spotted ? 0.48 : 0.34);
      var pool = ctx.createRadialGradient(0, 0, 8, 0, 0, 104);
      pool.addColorStop(0, 'rgba(220,245,255,' + poolAlpha + ')');
      pool.addColorStop(0.55, 'rgba(180,220,255,' + (poolAlpha * 0.55) + ')');
      pool.addColorStop(1, 'rgba(140,190,225,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(0, 0, 104, 62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = spotted ? 'rgba(255,238,170,0.96)' : 'rgba(190,225,255,0.52)';
      ctx.lineWidth = spotted ? 3 : 1.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.ellipse(0, 0, 98, 58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Rotor shadow projected beneath the aircraft
      ctx.save();
      ctx.translate(x + 12, y + 18);
      ctx.scale(1, 0.48);
      ctx.fillStyle = 'rgba(2,4,8,0.34)';
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);
      ctx.rotate(roll);
      ctx.scale(1, 0.82 + pitch);

      // Contrails / wake wisps behind the tail
      ctx.strokeStyle = 'rgba(170,210,230,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.bezierCurveTo(-68, -10, -94, 10, -126, -4);
      ctx.moveTo(-38, 8);
      ctx.bezierCurveTo(-70, 18, -88, 34, -112, 26);
      ctx.stroke();

      drawRotor(ctx, 0, 0, 58, (gameTime || 0) * 26, 'rgba(210,235,255,0.72)');

      ctx.fillStyle = '#182436';
      ctx.strokeStyle = '#91a8bd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(28, -14);
      ctx.quadraticCurveTo(44, 0, 28, 14);
      ctx.lineTo(-22, 16);
      ctx.quadraticCurveTo(-34, 10, -34, 0);
      ctx.quadraticCurveTo(-34, -10, -22, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#263850';
      ctx.fillRect(-34, -4, 17, 8);
      ctx.fillRect(-48, -2, 18, 4);
      ctx.strokeStyle = '#b7c9d8';
      ctx.beginPath();
      ctx.moveTo(-20, -18);
      ctx.lineTo(-20, -26);
      ctx.moveTo(-20, -26);
      ctx.lineTo(14, -26);
      ctx.stroke();

      // Twin red/blue rotating beacon
      var phase = Math.floor((gameTime || 0) * 7) % 2;
      ctx.fillStyle = phase ? '#ff1744' : '#00aaff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(2, -10, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = phase ? '#00aaff' : '#ff1744';
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(2, 10, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#d7e8f4';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VPD', 4, 1);
      ctx.restore();
    },

    renderHudStatus: function(ctx) {
      if (!active) return;
      var rightX = 1252;
      var x0 = rightX - 274;
      var y0 = 466;
      ctx.save();
      ctx.fillStyle = 'rgba(6,12,22,0.88)';
      ctx.strokeStyle = spotted ? '#ff2244' : (concealed ? '#39ff14' : '#d8efff');
      ctx.lineWidth = 1.5;
      VC.roundRect(ctx, x0, y0, 274, 38, 5);
      ctx.fill(); ctx.stroke();
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#d8efff';
      ctx.fillText('AIR SUPPORT // VPD AIR ONE', x0 + 10, y0 + 7);
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = concealed ? '#39ff14' : (spotted ? '#ff2244' : '#aac4d8');
      ctx.fillText(concealed ? 'TARGET LOST' : (spotted ? 'LOCKED  ' + Math.ceil(airSpotTimer * 10) / 10 + 's' : 'SEARCHING'), x0 + 264, y0 + 9);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8aa0b8';
      ctx.fillText('ALT ' + altitude + ' FT  |  SEEK 360', x0 + 10, y0 + 24);
      ctx.restore();
    },

    renderRadio: function(ctx) {
      if (!active || radioTimer <= 0) return;
      var rightX = 1252;
      var w = 274, h = 34, x0 = rightX - w, y0 = 428;
      ctx.save();
      ctx.fillStyle = 'rgba(6,12,22,0.92)';
      ctx.strokeStyle = '#ff2244';
      ctx.lineWidth = 1.5;
      VC.roundRect(ctx, x0, y0, w, h, 5);
      ctx.fill(); ctx.stroke();
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffb2bd';
      ctx.fillText('AIR ONE OVERHEAD // CONTACT', x0 + w / 2, y0 + h / 2);
      ctx.restore();
    }
  };

  VC.PoliceAir = PoliceAir;
  VC.policeAir = PoliceAir;
})();
