// Rain/night weather system: city wetness, rain particles, lightning, audio thunder,
// and weather gameplay modifiers shared with city/render/audio/vehicles/pedestrians.
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var Weather = {
    state: 'CLEAR',
    targetState: 'CLEAR',
    stateTimer: 0,
    rainIntensity: 0,
    targetRain: 0,
    wetness: 0,
    targetWetness: 0,
    lightning: 0,
    lightningTimer: 7 + Math.random() * 8,
    thunderTimer: -1,
    rainDrops: [],
    splashes: [],

    init: function(seed) {
      this.state = 'CLEAR';
      this.targetState = 'CLEAR';
      this.stateTimer = 18;
      this.rainIntensity = 0;
      this.targetRain = 0;
      this.wetness = 0;
      this.targetWetness = 0;
      this.lightning = 0;
      this.lightningTimer = 9;
      this.rainDrops.length = 0;
      this.splashes.length = 0;
      for (var i = 0; i < 260; i++) {
        this.rainDrops.push({
          x: Math.random() * 1280,
          y: Math.random() * 800,
          len: 7 + Math.random() * 11,
          speed: 420 + Math.random() * 260,
          drift: -25 - Math.random() * 55
        });
      }
    },

    forceState: function(state) {
      var values = {
        CLEAR: { rain: 0, wet: 0.05 },
        LIGHT_RAIN: { rain: 0.32, wet: 0.42 },
        HEAVY_RAIN: { rain: 0.72, wet: 0.78 },
        STORM: { rain: 1.0, wet: 1.0 }
      };
      var v = values[state] || values.CLEAR;
      this.state = state;
      this.targetState = state;
      this.targetRain = v.rain;
      this.targetWetness = v.wet;
      this.rainIntensity = v.rain;
      this.wetness = v.wet;
      this.stateTimer = 20;
    },

    update: function(dt, city, player, gameTime) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        var next = 'CLEAR';
        if (this.state === 'CLEAR') next = 'LIGHT_RAIN';
        else if (this.state === 'LIGHT_RAIN') next = 'HEAVY_RAIN';
        else if (this.state === 'HEAVY_RAIN') next = 'STORM';
        else if (this.state === 'STORM') next = 'CLEAR';
        else next = 'CLEAR';
        this.state = next;
        this.targetState = next;
        this.stateTimer = next === 'STORM' ? 28 : (next === 'HEAVY_RAIN' ? 24 : 20);
      }

      var targetRain = 0;
      var targetWet = 0.05;
      if (this.state === 'LIGHT_RAIN') { targetRain = 0.32; targetWet = 0.48; }
      if (this.state === 'HEAVY_RAIN') { targetRain = 0.72; targetWet = 0.82; }
      if (this.state === 'STORM') { targetRain = 1.0; targetWet = 1.0; }
      var rainEase = 1 - Math.exp(-dt * 0.12);
      var wetEase = 1 - Math.exp(-dt * 0.08);
      this.rainIntensity += (targetRain - this.rainIntensity) * rainEase;
      this.wetness += (targetWet - this.wetness) * wetEase;

      var count = Math.floor(this.rainIntensity * 260);
      for (var i = 0; i < this.rainDrops.length; i++) {
        var drop = this.rainDrops[i];
        if (i >= count) continue;
        var speed = drop.speed * (0.8 + this.rainIntensity * 0.6);
        drop.x += drop.drift * dt;
        drop.y += speed * dt;
        if (drop.y > 820 || drop.x < -30) {
          drop.x = Math.random() * 1340 - 30;
          drop.y = -20 - Math.random() * 180;
          if (Math.random() < this.rainIntensity * 0.7) {
            this.splashes.push({ x: drop.x, y: drop.y + 20, life: 0.22, maxLife: 0.22 });
          }
        }
      }
      for (var s = this.splashes.length - 1; s >= 0; s--) {
        this.splashes[s].life -= dt;
        if (this.splashes[s].life <= 0) this.splashes.splice(s, 1);
      }
      if (this.splashes.length > 180) this.splashes.splice(0, this.splashes.length - 180);

      if (this.state === 'STORM') {
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) {
          this.lightning = 0.75;
          this.lightningTimer = 5 + Math.random() * 10;
          this.thunderTimer = 0.25 + Math.random() * 0.8;
        }
      } else {
        this.lightningTimer -= dt * 0.35;
        if (this.state === 'HEAVY_RAIN' && this.lightningTimer < -30) {
          this.lightningTimer = 12 + Math.random() * 18;
        }
      }
      if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - dt * 2.8);
      if (this.thunderTimer >= 0) {
        this.thunderTimer -= dt;
        if (this.thunderTimer < 0 && VC.Audio) VC.Audio.thunder();
      }
    },

    getGripMultiplier: function() {
      return 1 - this.wetness * 0.48;
    },

    getVisibility: function() {
      if (this.state === 'CLEAR') return 1;
      return 1 - this.rainIntensity * 0.28;
    },

    isRaining: function() {
      return this.rainIntensity > 0.12;
    },

    renderGroundReflections: function(ctx, city, view, timeSec) {
      if (this.wetness < 0.08) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      var alpha = this.wetness * 0.38;

      if (city) {
        for (var r = 0; r < city.roads.length; r++) {
          var rd = city.roads[r];
          if (rd.x + rd.w < view.left || rd.x > view.right ||
              rd.y + rd.h < view.top || rd.y > view.bottom) continue;
          ctx.fillStyle = 'rgba(10,18,28,' + (this.wetness * 0.18) + ')';
          ctx.fillRect(rd.x, rd.y, rd.w, rd.h);
        }
      }

      var colors = [
        { x: 0.28, y: 0.32, c: 'rgba(0,240,255,' + (alpha * 0.52) + ')' },
        { x: 0.70, y: 0.24, c: 'rgba(255,0,127,' + (alpha * 0.46) + ')' },
        { x: 0.54, y: 0.68, c: 'rgba(57,255,20,' + (alpha * 0.38) + ')' },
        { x: 0.18, y: 0.76, c: 'rgba(255,170,0,' + (alpha * 0.36) + ')' }
      ];
      for (var i = 0; i < colors.length; i++) {
        var cx = view.left + (view.right - view.left) * colors[i].x;
        var cy = view.top + (view.bottom - view.top) * colors[i].y;
        var grad = ctx.createLinearGradient(cx - 10, cy - 50, cx + 10, cy + 80);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.45, colors[i].c);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 18 + this.wetness * 10, 85, 0.12, 0, Math.PI * 2);
        ctx.fill();
      }

      if (city && VC.traffic) {
        var cars = VC.traffic.vehicles;
        for (var j = 0; j < cars.length; j++) {
          var v = cars[j].vehicle;
          if (v.x < view.left || v.x > view.right || v.y < view.top || v.y > view.bottom) continue;
          var lightColor = v.typeKey === 'interceptor'
            ? ((Math.floor(timeSec * 8) % 2) ? 'rgba(0,229,255,' : 'rgba(255,23,68,')
            : 'rgba(255,240,190,';
          ctx.fillStyle = lightColor + (alpha * 0.7) + ')';
          ctx.beginPath();
          ctx.ellipse(v.x + Math.cos(v.heading) * 8, v.y + Math.sin(v.heading) * 8,
            8, 28, v.heading, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    renderRainAndLightning: function(ctx) {
      ctx.save();
      if (this.lightning > 0) {
        ctx.fillStyle = 'rgba(190,220,255,' + (this.lightning * 0.34) + ')';
        ctx.fillRect(0, 0, 1280, 800);
      }

      if (this.rainIntensity > 0.05) {
        ctx.strokeStyle = 'rgba(180,215,255,' + (0.12 + this.rainIntensity * 0.38) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        var visibleCount = Math.floor(this.rainDrops.length * this.rainIntensity);
        for (var i = 0; i < visibleCount; i++) {
          var d = this.rainDrops[i];
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.drift * 0.025, d.y + d.len);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(170,210,230,' + (0.18 + this.rainIntensity * 0.32) + ')';
        ctx.beginPath();
        for (var s = 0; s < this.splashes.length; s++) {
          var sp = this.splashes[s];
          var sx = sp.x;
          var sy = sp.y;
          ctx.moveTo(sx - 3, sy);
          ctx.lineTo(sx + 3, sy);
          ctx.moveTo(sx - 1, sy - 2);
          ctx.lineTo(sx + 1, sy - 5);
        }
        ctx.stroke();
      }

      if (this.rainIntensity > 0.18) {
        var fog = this.rainIntensity * 0.12;
        var fogGrad = ctx.createRadialGradient(640, 400, 220, 640, 400, 760);
        fogGrad.addColorStop(0, 'rgba(80,110,130,' + fog + ')');
        fogGrad.addColorStop(1, 'rgba(20,35,55,' + (fog * 1.8) + ')');
        ctx.fillStyle = fogGrad;
        ctx.fillRect(0, 0, 1280, 800);
      }
      ctx.restore();
    }
  };

  VC.weather = Weather;
})();
