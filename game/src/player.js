// Top-down player entity with animated walk cycle, directional facing, and physics collision
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  function Player(x, y) {
    this.x = x || 1160;
    this.y = y || 1160;
    this.radius = 13;
    this.vx = 0;
    this.vy = 0;
    this.facing = 0; // radians

    // Speeds in pixels per second
    this.walkSpeed = 165;
    this.sprintSpeed = 280;

    // Animation states
    this.walkPhase = 0;
    this.lastFootstep = 0;
    this.isMoving = false;
    this.isSprinting = false;

    // Melee attack animation
    this.punchTimer = 0;
    this.punchHand = 0; // 0 = right, 1 = left

    // Gameplay stats
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 50;
    this.maxArmor = 100;
    this.cash = 250;
    this.wantedLevel = 0;
    this.weapon = 'UNARMED';

    // Visual feedback
    this.hitFlashTimer = 0;
  }

  Player.prototype.damage = function(amount) {
    if (this.health <= 0) return;
    this.hitFlashTimer = 0.25;

    if (this.armor > 0) {
      if (this.armor >= amount) {
        this.armor -= amount;
        amount = 0;
      } else {
        amount -= this.armor;
        this.armor = 0;
      }
    }

    if (amount > 0) {
      this.health = Math.max(0, this.health - amount);
    }

    if (VC.Audio) VC.Audio.gunshot();
    if (VC.hud) {
      if (this.health <= 0) {
        VC.hud.toast('WASTED', 3.0);
      } else {
        VC.hud.toast('HEALTH: ' + Math.ceil(this.health), 1.0);
      }
    }
  };

  Player.prototype.heal = function(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    if (VC.Audio) VC.Audio.uiBlip(1200);
  };

  Player.prototype.addCash = function(amount) {
    this.cash += amount;
    if (VC.Audio) VC.Audio.uiBlip(1400);
    if (VC.hud) VC.hud.toast('+$' + amount, 1.5);
  };

  Player.prototype.update = function(dt, city) {
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }

    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
    }

    // Process movement input
    var move = VC.Input.getMovementVector();
    this.isSprinting = VC.Input.isSprinting() && move.len > 0;
    var targetSpeed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;

    var targetVx = move.x * targetSpeed;
    var targetVy = move.y * targetSpeed;

    // Crisp response
    var accel = 1 - Math.exp(-dt * 18);
    this.vx += (targetVx - this.vx) * accel;
    this.vy += (targetVy - this.vy) * accel;

    var curSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.isMoving = curSpeed > 8;

    // Advance walk cycle
    if (this.isMoving) {
      var stepRate = this.isSprinting ? 14 : 9.5;
      this.walkPhase += dt * stepRate;

      // Trigger footstep audio every half cycle
      if (Math.sin(this.walkPhase) * Math.sin(this.lastFootstep) < 0) {
        if (VC.Audio) VC.Audio.footstep();
      }
      this.lastFootstep = this.walkPhase;
    } else {
      this.walkPhase = 0;
    }

    // Facing direction: prioritize aiming towards mouse pointer
    if (VC.Input.mouse) {
      var dx = VC.Input.mouse.worldX - this.x;
      var dy = VC.Input.mouse.worldY - this.y;
      if (Math.hypot(dx, dy) > 15) {
        var targetAngle = Math.atan2(dy, dx);
        // Smoothly rotate toward mouse
        var diff = targetAngle - this.facing;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.facing += diff * (1 - Math.exp(-dt * 20));
      } else if (this.isMoving) {
        this.facing = Math.atan2(this.vy, this.vx);
      }
    } else if (this.isMoving) {
      this.facing = Math.atan2(this.vy, this.vx);
    }

    // Punch / Action trigger
    if (VC.Input.mouse && VC.Input.mouse.justPressed) {
      if (this.weapon === 'UNARMED') {
        this.punchTimer = 0.22;
        this.punchHand = (this.punchHand + 1) % 2;
        if (VC.Audio) VC.Audio.uiBlip(440);
      } else {
        if (VC.Audio) VC.Audio.gunshot();
      }
    }

    // Movement & Collision with smooth axis-sliding
    if (city) {
      // Step X
      var nextX = this.x + this.vx * dt;
      var colX = VC.City.checkCollision(city, nextX, this.y, this.radius);
      if (colX.hit) {
        nextX += colX.nx * colX.depth;
        this.vx = 0;
      }
      this.x = nextX;

      // Step Y
      var nextY = this.y + this.vy * dt;
      var colY = VC.City.checkCollision(city, this.x, nextY, this.radius);
      if (colY.hit) {
        nextY += colY.ny * colY.depth;
        this.vy = 0;
      }
      this.y = nextY;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
  };

  Player.prototype.render = function(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // 1. Drop shadow (soft blurred dark ellipse)
    ctx.save();
    ctx.shadowColor = 'rgba(1, 3, 7, 0.85)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(2, 4, 8, 0.7)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rotate player to facing angle
    ctx.rotate(this.facing);

    var walkSin = Math.sin(this.walkPhase);
    var legOffset1 = walkSin * 6;
    var legOffset2 = -walkSin * 6;

    // 2. Animated Legs & Boots
    ctx.fillStyle = VC.PALETTE.playerBoots;
    // Left leg
    ctx.fillRect(-6 + legOffset1, -12, 5, 10);
    // Right leg
    ctx.fillRect(-6 + legOffset2, 2, 5, 10);

    // 3. Torso / Shoulders (Dark street jacket)
    ctx.fillStyle = this.hitFlashTimer > 0 ? '#ff3344' : VC.PALETTE.playerJacket;
    VC.roundRect(ctx, -10, -11, 20, 22, 6);
    ctx.fill();

    // Jacket collar trim
    ctx.fillStyle = VC.PALETTE.playerJacketCollar;
    ctx.beginPath();
    ctx.moveTo(-4, -10);
    ctx.lineTo(6, -7);
    ctx.lineTo(6, 7);
    ctx.lineTo(-4, 10);
    ctx.closePath();
    ctx.fill();

    // 4. Arms & Hands
    var rightArmExtend = 0;
    var leftArmExtend = 0;
    if (this.punchTimer > 0) {
      var punchProgress = Math.sin((this.punchTimer / 0.22) * Math.PI);
      if (this.punchHand === 0) {
        rightArmExtend = punchProgress * 12;
      } else {
        leftArmExtend = punchProgress * 12;
      }
    }

    // Right arm
    ctx.fillStyle = VC.PALETTE.playerJacket;
    ctx.fillRect(0, 7, 8 + rightArmExtend, 5);
    // Right fist / skin
    ctx.fillStyle = VC.PALETTE.playerSkin;
    ctx.beginPath();
    ctx.arc(8 + rightArmExtend, 9, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Left arm
    ctx.fillStyle = VC.PALETTE.playerJacket;
    ctx.fillRect(0, -12, 8 + leftArmExtend, 5);
    // Left fist / skin
    ctx.fillStyle = VC.PALETTE.playerSkin;
    ctx.beginPath();
    ctx.arc(8 + leftArmExtend, -10, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 5. Head & Styled Hair
    // Neck/ears
    ctx.fillStyle = VC.PALETTE.playerSkin;
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = VC.PALETTE.playerHair;
    ctx.beginPath();
    ctx.arc(-2, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  VC.Player = Player;
})();
