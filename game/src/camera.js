// 2D Top-down game camera with smooth tracking and velocity lookahead
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  function Camera() {
    this.x = 1000;
    this.y = 1000;
    this.zoom = 1.0;
    this.viewWidth = 1280;
    this.viewHeight = 800;

    this.targetX = 1000;
    this.targetY = 1000;

    this.lookAheadX = 0;
    this.lookAheadY = 0;
    this.leadDist = 70; // pixels to look ahead when moving/aiming
    this.baseZoom = 1.0;
    // Named "sniperZoomTarget" because an instance field called sniperZoom would
    // shadow Camera.prototype.sniperZoom(enabled) and break the scoped-fire call.
    this.sniperZoomTarget = 1.0;
    this.shakeTimer = 0;
    this.shakeAmount = 0;

    this.bounds = {
      minX: 0,
      minY: 0,
      maxX: 2400,
      maxY: 2400
    };
  }

  Camera.prototype.init = function(width, height) {
    this.viewWidth = width;
    this.viewHeight = height;
  };

  Camera.prototype.setBounds = function(minX, minY, maxX, maxY) {
    this.bounds.minX = minX;
    this.bounds.minY = minY;
    this.bounds.maxX = maxX;
    this.bounds.maxY = maxY;
  };

  Camera.prototype.snapTo = function(x, y) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.lookAheadX = 0;
    this.lookAheadY = 0;
    this.clamp();
  };

  // Explosion shake and sniper zoom are camera-owned effects rather than render hacks.
  Camera.prototype.shake = function(amount, duration) {
    this.shakeAmount = Math.max(this.shakeAmount, amount || 6);
    this.shakeTimer = Math.max(this.shakeTimer, duration || 0.25);
  };

  Camera.prototype.sniperZoom = function(enabled) {
    this.sniperZoomTarget = enabled ? 1.55 : 1.0;
  };

  Camera.prototype.updateEffects = function(dt, speedRatio) {
    var drivingZoom = 1.0 + Math.min(0.28, (speedRatio || 0) * 0.28);
    this.baseZoom += (drivingZoom - this.baseZoom) * Math.min(1, dt * 2.4);
    var desired = this.sniperZoomTarget > 1 ? this.sniperZoomTarget : this.baseZoom;
    this.zoom += (desired - this.zoom) * Math.min(1, dt * 5);
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
  };

  Camera.prototype.update = function(dt, targetEntity) {
    if (!targetEntity) return;

    // Calculate lead offset based on velocity or facing
    var vx = targetEntity.vx || 0;
    var vy = targetEntity.vy || 0;
    var speed = Math.sqrt(vx * vx + vy * vy);

    var targetLeadX = 0;
    var targetLeadY = 0;
    if (speed > 10) {
      targetLeadX = (vx / speed) * this.leadDist;
      targetLeadY = (vy / speed) * this.leadDist;
    } else if (targetEntity.facing !== undefined) {
      targetLeadX = Math.cos(targetEntity.facing) * (this.leadDist * 0.4);
      targetLeadY = Math.sin(targetEntity.facing) * (this.leadDist * 0.4);
    }

    var leadDamp = 1 - Math.exp(-dt * 4);
    this.lookAheadX += (targetLeadX - this.lookAheadX) * leadDamp;
    this.lookAheadY += (targetLeadY - this.lookAheadY) * leadDamp;

    this.targetX = targetEntity.x + this.lookAheadX;
    this.targetY = targetEntity.y + this.lookAheadY;

    var followDamp = 1 - Math.exp(-dt * 6.5);
    this.x += (this.targetX - this.x) * followDamp;
    this.y += (this.targetY - this.y) * followDamp;

    this.clamp();
  };

  Camera.prototype.clamp = function() {
    var halfW = (this.viewWidth / 2) / this.zoom;
    var halfH = (this.viewHeight / 2) / this.zoom;

    if (this.bounds.maxX - this.bounds.minX > halfW * 2) {
      if (this.x - halfW < this.bounds.minX) this.x = this.bounds.minX + halfW;
      if (this.x + halfW > this.bounds.maxX) this.x = this.bounds.maxX - halfW;
    } else {
      this.x = (this.bounds.minX + this.bounds.maxX) / 2;
    }

    if (this.bounds.maxY - this.bounds.minY > halfH * 2) {
      if (this.y - halfH < this.bounds.minY) this.y = this.bounds.minY + halfH;
      if (this.y + halfH > this.bounds.maxY) this.y = this.bounds.maxY - halfH;
    } else {
      this.y = (this.bounds.minY + this.bounds.maxY) / 2;
    }
  };

  Camera.prototype.screenToWorld = function(sx, sy) {
    var wx = (sx - this.viewWidth / 2) / this.zoom + this.x;
    var wy = (sy - this.viewHeight / 2) / this.zoom + this.y;
    return { x: wx, y: wy };
  };

  Camera.prototype.worldToScreen = function(wx, wy) {
    var sx = (wx - this.x) * this.zoom + this.viewWidth / 2;
    var sy = (wy - this.y) * this.zoom + this.viewHeight / 2;
    return { x: sx, y: sy };
  };

  Camera.prototype.getVisibleBounds = function(margin) {
    if (margin === undefined) margin = 80;
    var halfW = (this.viewWidth / 2) / this.zoom + margin;
    var halfH = (this.viewHeight / 2) / this.zoom + margin;
    return {
      left: this.x - halfW,
      top: this.y - halfH,
      right: this.x + halfW,
      bottom: this.y + halfH
    };
  };

  Camera.prototype.applyTransform = function(ctx) {
    ctx.save();
    ctx.translate(this.viewWidth / 2, this.viewHeight / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-Math.round(this.x), -Math.round(this.y));
  };

  Camera.prototype.restoreTransform = function(ctx) {
    ctx.restore();
  };

  // Apply shake outside world coordinates so every rendered world element follows it once.
  Camera.prototype.beginRender = function(ctx) {
    var ox = 0;
    var oy = 0;
    if (this.shakeTimer > 0) {
      var rng = VC.RNG && VC.RNG.stream ? VC.RNG.stream('camera') : null;
      ox = (rng ? rng.randFloat(-1, 1) : (Math.random() * 2 - 1)) * this.shakeAmount * (this.shakeTimer / 0.25);
      oy = (rng ? rng.randFloat(-1, 1) : (Math.random() * 2 - 1)) * this.shakeAmount * (this.shakeTimer / 0.25);
    }
    ctx.translate(ox, oy);
  };

  VC.camera = new Camera();
  VC.Camera = Camera;
})();
