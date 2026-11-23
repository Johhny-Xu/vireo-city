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
    this.cash = 2500;
    this.wantedLevel = 0;
    this.weapon = 'UNARMED';

    // Vehicles & car jacking
    this.vehicle = null;
    this.nearVehicle = null;

    // Visual feedback
    this.hitFlashTimer = 0;
    // Sprint stamina: drains while moving, regenerates once released or rested.
    this.stamina = 100;
    this.maxStamina = 100;
    this.splashTimer = 0;
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

    // A. Driving Mode (inside vehicle)
    if (this.vehicle) {
      var throttle = 0;
      var steer = 0;
      if (VC.Input) {
        if (VC.Input.isDown('KeyW') || VC.Input.isDown('ArrowUp')) throttle += 1;
        if (VC.Input.isDown('KeyS') || VC.Input.isDown('ArrowDown')) throttle -= 1;
        if (VC.Input.isDown('KeyD') || VC.Input.isDown('ArrowRight')) steer += 1;
        if (VC.Input.isDown('KeyA') || VC.Input.isDown('ArrowLeft')) steer -= 1;
      }

      var handbrake = VC.Input ? VC.Input.isDown('Space') : false;
      var boost = VC.Input ? (VC.Input.isDown('ShiftLeft') || VC.Input.isDown('ShiftRight')) : false;

      this.vehicle.applyControl(throttle, steer, handbrake, boost, dt);
      this.vehicle.update(dt, city);

      // Synchronize player with vehicle
      this.x = this.vehicle.x;
      this.y = this.vehicle.y;
      this.vx = this.vehicle.vx;
      this.vy = this.vehicle.vy;
      this.facing = this.vehicle.heading;

      // Engine sound
      var speedRatio = Math.abs(this.vehicle.speed) / this.vehicle.maxSpeed;
      if (VC.Audio) VC.Audio.setEngineHum(speedRatio);

      // Dynamic camera zoom and lead while driving
      if (VC.camera) {
        // A slightly tighter magnification keeps the vehicle large and reinforces speed,
        // while the on-foot branch below restores the normal 1.0 view and 70px lead.
        VC.camera.zoom = 1.0 + speedRatio * 0.18;
        VC.camera.leadDist = 110 + speedRatio * 60;
      }

      // Exit Vehicle on KeyF
      if (VC.Input && VC.Input.justPressed('KeyF')) {
        var v = this.vehicle;
        var heading = v.heading;
        var sideDist = v.h * 0.5 + 20;

        // Try driver side (left side of vehicle heading)
        var leftX = v.x + Math.sin(heading) * sideDist;
        var leftY = v.y - Math.cos(heading) * sideDist;
        var colLeft = city ? VC.City.checkCollision(city, leftX, leftY, this.radius) : { hit: false };

        var exitX = leftX;
        var exitY = leftY;
        if (colLeft.hit) {
          // Try passenger side (right side)
          var rightX = v.x - Math.sin(heading) * sideDist;
          var rightY = v.y + Math.cos(heading) * sideDist;
          var colRight = city ? VC.City.checkCollision(city, rightX, rightY, this.radius) : { hit: false };
          if (!colRight.hit) {
            exitX = rightX;
            exitY = rightY;
          } else {
            // Try rear
            var rearX = v.x - Math.cos(heading) * (v.w * 0.5 + 22);
            var rearY = v.y - Math.sin(heading) * (v.w * 0.5 + 22);
            exitX = rearX;
            exitY = rearY;
          }
        }

        this.x = exitX;
        this.y = exitY;
        this.vx = 0;
        this.vy = 0;
        v.driver = null;
        var vName = v.typeName;
        this.vehicle = null;

        if (VC.camera) {
          VC.camera.zoom = 1.0;
          VC.camera.leadDist = 70;
        }
        if (VC.Audio) VC.Audio.setEngineHum(0);
        if (VC.hud) VC.hud.toast('EXITED ' + vName.toUpperCase(), 1.5);
      }
      return;
    }

    // B. On Foot Mode
    if (VC.camera) {
      VC.camera.zoom = 1.0;
      VC.camera.leadDist = 70;
    }
    if (VC.Audio) VC.Audio.setEngineHum(0);

    // Process movement input
    var move = VC.Input ? VC.Input.getMovementVector() : { x: 0, y: 0, len: 0 };
    var sprintHeld = VC.Input ? (VC.Input.action ? VC.Input.action('sprint') : VC.Input.isSprinting()) : false;
    this.isSprinting = sprintHeld && move.len > 0 && this.stamina > 4;
    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 24);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * 17);
    }
    if (this.stamina <= 0) this.isSprinting = false;
    var targetSpeed = this.isSprinting ? this.sprintSpeed : this.walkSpeed;

    var targetVx = move.x * targetSpeed;
    var targetVy = move.y * targetSpeed;

    // Crisp response
    var accel = 1 - Math.exp(-dt * 18);
    this.vx += (targetVx - this.vx) * accel;
    this.vy += (targetVy - this.vy) * accel;

    var curSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.isMoving = curSpeed > 8;

    if (this.isMoving && VC.weather && VC.weather.isRaining()) {
      this.splashTimer -= dt;
      if (this.splashTimer <= 0) {
        if (VC.weather.spawnSplash) VC.weather.spawnSplash(this.x, this.y);
        this.splashTimer = this.isSprinting ? 0.055 : 0.10;
      }
    }

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
    if (VC.Input && VC.Input.mouse) {
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
    if (VC.Input && VC.Input.mouse && VC.Input.mouse.justPressed) {
      if (this.weapon === 'UNARMED') {
        this.punchTimer = 0.22;
        this.punchHand = (this.punchHand + 1) % 2;
        if (VC.Audio) VC.Audio.uiBlip(440);
      } else {
        if (VC.Audio) VC.Audio.gunshot();
      }
    }

    // Check for nearby vehicles to take/steal
    this.nearVehicle = null;
    var closestVeh = null;
    var closestDist = 65; // reach radius

    // 1. Check traffic vehicles
    if (VC.traffic && VC.traffic.vehicles) {
      for (var t = 0; t < VC.traffic.vehicles.length; t++) {
        var tv = VC.traffic.vehicles[t].vehicle;
        var td = Math.hypot(tv.x - this.x, tv.y - this.y);
        if (td < closestDist) {
          closestDist = td;
          closestVeh = tv;
        }
      }
    }

    // 2. Check parked cars in city
    if (city && city.parkedCars) {
      for (var p = 0; p < city.parkedCars.length; p++) {
        var pc = city.parkedCars[p];
        var pd = Math.hypot(pc.x - this.x, pc.y - this.y);
        if (pd < closestDist) {
          closestDist = pd;
          closestVeh = pc;
        }
      }
    }

    this.nearVehicle = closestVeh;

    // Handle car entering on KeyF
    if (closestVeh && VC.Input && VC.Input.justPressed('KeyF')) {
      if (closestVeh instanceof VC.Vehicle) {
        this.vehicle = closestVeh;
      } else {
        // Convert static parked car object to dynamic Vehicle
        var typeKey = closestVeh.typeKey || 'sable';
        var newV = new VC.Vehicle(typeKey, closestVeh.x, closestVeh.y, closestVeh.angle || 0);
        if (closestVeh.color) newV.color = closestVeh.color;
        if (closestVeh.roofColor) newV.roofColor = closestVeh.roofColor;
        if (closestVeh.glassColor) newV.glassColor = closestVeh.glassColor;

        // Remove from city.parkedCars and remove corresponding collider
        var pIdx = city.parkedCars.indexOf(closestVeh);
        if (pIdx !== -1) {
          city.parkedCars.splice(pIdx, 1);
        }
        for (var c = city.colliders.length - 1; c >= 0; c--) {
          var col = city.colliders[c];
          if (Math.hypot(col.x + col.w / 2 - closestVeh.x, col.y + col.h / 2 - closestVeh.y) < 25) {
            city.colliders.splice(c, 1);
            break;
          }
        }
        this.vehicle = newV;
      }

      this.vehicle.driver = this;
      this.nearVehicle = null;
      if (VC.Audio) VC.Audio.uiBlip(320);
      if (VC.hud) VC.hud.toast('TAKEN: ' + this.vehicle.typeName.toUpperCase(), 2.0);
      // Trigger wanted crime and mission notification
      if (VC.wanted) {
        if (this.vehicle.typeKey === 'interceptor') {
          VC.wanted.addCrime('killed_officer', this); // stealing police car = heavy crime
        } else {
          VC.wanted.addCrime('stole_car', this);
        }
      } else if (this.vehicle.typeKey === 'interceptor' && this.wantedLevel === 0) {
        this.wantedLevel = 1;
      }
      if (VC.Missions) VC.Missions.registerVehicleJack(this.vehicle.typeKey);
      return;
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
    if (this.vehicle) return; // Inside vehicle, rendered as vehicle
    ctx.save();
    ctx.translate(this.x, this.y);

    // High-contrast civic marker makes the on-foot character legible at thumbnail zoom.
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 245, 255, 0.92)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 1. Drop shadow (soft blurred dark ellipse)
    ctx.save();
    ctx.shadowColor = 'rgba(1, 3, 7, 0.85)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(2, 4, 8, 0.7)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rotate player to facing angle
    ctx.rotate(this.facing);

    var walkSin = Math.sin(this.walkPhase);
    var legOffset1 = walkSin * 6;
    var legOffset2 = -walkSin * 6;

    // 2. Animated Legs & Boots
    ctx.fillStyle = VC.PALETTE.playerPants;
    ctx.fillRect(-6 + legOffset1, -12, 5, 8);
    ctx.fillRect(-6 + legOffset2, 2, 5, 8);
    ctx.fillStyle = VC.PALETTE.playerBoots;
    // Left leg
    ctx.fillRect(-6 + legOffset1, -4, 5, 4);
    // Right leg
    ctx.fillRect(-6 + legOffset2, 8, 5, 4);

    // 3. Torso / Shoulders (Amber street jacket)
    ctx.fillStyle = this.hitFlashTimer > 0 ? '#ff3344' : VC.PALETTE.playerJacket;
    VC.roundRect(ctx, -10, -11, 20, 22, 6);
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = '#fff1b8';
    ctx.lineWidth = 1.25;
    VC.roundRect(ctx, -10, -11, 20, 22, 6);
    ctx.stroke();
    ctx.restore();

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

    // Hair, shifted toward the back of the head so the face remains visible
    ctx.fillStyle = VC.PALETTE.playerHair;
    ctx.beginPath();
    ctx.arc(-3.5, -1, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  VC.Player = Player;
})();
