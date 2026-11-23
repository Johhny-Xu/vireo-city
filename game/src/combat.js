// Combat: damage pipeline, screen effects, health regen, BUSTED / death screen
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  // ── Internal state ─────────────────────────────────────────────────────────
  var hitFlashAlpha   = 0;    // 0-1 red screen flash
  var vignetteAlpha   = 0;    // 0-1 damage vignette pulse
  var hitDirectionAng = 0;    // radians – direction of last hit
  var hitDirAlpha     = 0;    // fade for the directional indicator
  var regenCooldown   = 0;    // seconds until regen starts
  var bustedTimer     = 0;    // > 0 → show BUSTED screen
  var bustedFadeIn    = 0;    // 0→1 fade-to-black

  var REGEN_DELAY      = 8.0;   // seconds after last hit
  var REGEN_RATE       = 2.5;   // HP/sec
  var BUSTED_DURATION  = 3.5;   // total screen time
  var BUSTED_FEE       = 150;
  var HOSPITAL_X       = 820;   // near Vireo General
  var HOSPITAL_Y       = 480;

  // ── Public API ─────────────────────────────────────────────────────────────
  var Combat = {
    triggerPoliceSpot: function() {
      hitFlashAlpha = Math.min(1, hitFlashAlpha + 0.22);
      vignetteAlpha = Math.max(vignetteAlpha, 0.7);
    },
    // Apply damage to player from world-space origin (ox, oy).
    // Returns true if the player died this call.
    applyDamage: function(player, amount, originX, originY) {
      if (!player || player.health <= 0) return false;

      player.damage(amount);

      // Directional hit indicator angle (screen-space angle)
      if (originX !== undefined && originY !== undefined) {
        hitDirectionAng = Math.atan2(originY - player.y, originX - player.x);
        hitDirAlpha = 1.0;
      }

      hitFlashAlpha = Math.min(1, hitFlashAlpha + 0.45);
      vignetteAlpha = 1.0;
      regenCooldown = REGEN_DELAY;

      if (player.health <= 0 && bustedTimer <= 0) {
        this.triggerBusted(player);
        return true;
      }
      return false;
    },

    triggerBusted: function(player) {
      bustedTimer = BUSTED_DURATION;
      bustedFadeIn = 0;
      player.health = 0;
      if (VC.Audio) VC.Audio.uiBlip(80);
    },

    isBusted: function() {
      return bustedTimer > 0;
    },

    update: function(dt, player) {
      if (!player) return;

      // ── BUSTED sequence ──
      if (bustedTimer > 0) {
        bustedTimer -= dt;
        // Fade-in black (first half) then fade-out (second half)
        var half = BUSTED_DURATION * 0.5;
        if (bustedTimer > half) {
          bustedFadeIn = 1 - (bustedTimer - half) / half;
        } else {
          bustedFadeIn = bustedTimer / half;
        }

        if (bustedTimer <= 0) {
          // Respawn
          bustedTimer = 0;
          bustedFadeIn = 0;
          player.x = HOSPITAL_X;
          player.y = HOSPITAL_Y;
          player.vx = 0;
          player.vy = 0;
          player.health = 60;
          player.armor = 0;
          player.vehicle = null;
          player.nearVehicle = null;
          player.cash = Math.max(0, player.cash - BUSTED_FEE);
          if (VC.wanted) VC.wanted.reduceLevel(2);
          if (VC.camera) VC.camera.snapTo(HOSPITAL_X, HOSPITAL_Y);
          if (VC.hud) VC.hud.toast('RELEASED FROM VIREO GENERAL  -$' + BUSTED_FEE, 3.5);
          if (VC.Audio) VC.Audio.uiBlip(600);
        }
        return; // freeze updates while busted
      }

      // ── Health regeneration ──
      if (regenCooldown > 0) {
        regenCooldown -= dt;
      } else if (player.health > 0 && player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + REGEN_RATE * dt);
      }

      // ── Screen flash decay ──
      hitFlashAlpha  = Math.max(0, hitFlashAlpha  - dt * 3.5);
      vignetteAlpha  = Math.max(0, vignetteAlpha  - dt * 2.0);
      hitDirAlpha    = Math.max(0, hitDirAlpha    - dt * 1.5);
    },

    // Draw screen-space overlays (called in screen-space, after camera restore)
    renderScreenEffects: function(ctx, player, timeSec) {
      if (!player) return;

      // ── BUSTED overlay ──
      if (bustedTimer > 0) {
        // Fade to black
        ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, bustedFadeIn * 1.4) + ')';
        ctx.fillRect(0, 0, 1280, 800);

        if (bustedFadeIn > 0.35 && bustedTimer > BUSTED_DURATION * 0.25) {
          // "BUSTED" text
          ctx.save();
          var pulse = 1 + 0.04 * Math.sin((timeSec || 0) * 8);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 90px "Courier New", monospace';
          ctx.fillStyle = 'rgba(220,30,30,' + Math.min(1, bustedFadeIn * 2) + ')';
          ctx.shadowColor = '#ff0000';
          ctx.shadowBlur = 40;
          ctx.save();
          ctx.translate(640, 390);
          ctx.scale(pulse, pulse);
          ctx.fillText('BUSTED', 0, 0);
          ctx.restore();
          ctx.font = 'bold 20px "Courier New", monospace';
          ctx.fillStyle = 'rgba(200,160,160,' + Math.min(1, bustedFadeIn * 2) + ')';
          ctx.shadowBlur = 10;
          ctx.fillText('VIREO GENERAL HOSPITAL — $' + BUSTED_FEE + ' FEE', 640, 470);
          ctx.restore();
        }
        return; // skip other effects during busted
      }

      // ── Red hit flash (full screen) ──
      if (hitFlashAlpha > 0) {
        ctx.fillStyle = 'rgba(220,20,20,' + (hitFlashAlpha * 0.35) + ')';
        ctx.fillRect(0, 0, 1280, 800);
      }

      // Police detection edge warning
      if (VC.wanted && VC.wanted.spotFeedback > 0) {
        var edge = VC.wanted.spotFeedback / 0.9;
        ctx.save();
        ctx.lineWidth = 18 * edge;
        ctx.strokeStyle = 'rgba(255,28,45,' + (0.85 * edge) + ')';
        ctx.strokeRect(8, 8, 1264, 784);
        ctx.restore();
      }

      // ── Damage vignette ──
      if (vignetteAlpha > 0 || player.health < 40) {
        var vAlpha = Math.max(vignetteAlpha * 0.55, player.health < 40 ? (1 - player.health / 40) * 0.4 : 0);
        var vGrad = ctx.createRadialGradient(640, 400, 180, 640, 400, 720);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, 'rgba(180,0,0,' + vAlpha + ')');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, 1280, 800);
      }

      // ── Directional hit indicator (wedge on screen edge) ──
      if (hitDirAlpha > 0.05) {
        ctx.save();
        ctx.globalAlpha = hitDirAlpha * 0.85;
        // Convert world angle to screen angle using camera
        var screenAng = hitDirectionAng;
        if (VC.camera) screenAng += VC.camera.angle || 0;
        var cx = 640, cy = 400;
        var r = 180;
        var ix = cx + Math.cos(screenAng) * r;
        var iy = cy + Math.sin(screenAng) * r;
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        // Draw an arc wedge at the hit side
        ctx.arc(cx, cy, r, screenAng - 0.3, screenAng + 0.3);
        ctx.stroke();
        // Arrowhead
        ctx.fillStyle = '#ff2222';
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ix - Math.cos(screenAng - 0.5) * 14, iy - Math.sin(screenAng - 0.5) * 14);
        ctx.lineTo(ix - Math.cos(screenAng + 0.5) * 14, iy - Math.sin(screenAng + 0.5) * 14);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  };

  VC.combat = Combat;
})();
