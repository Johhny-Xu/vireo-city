// Vehicle models, procedural vehicle rendering, and driving physics for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  // Global skid marks buffer
  VC.skidmarks = VC.skidmarks || [];
  var vehicleExplosions = [];
  var explosionFragments = [];
  // Vehicles comment: drift smoke and collision sparks make vehicle damage readable at chase speed.

  function addSkidmark(x1, y1, x2, y2, alpha) {
    if (VC.skidmarks.length > 250) {
      VC.skidmarks.shift();
    }
    VC.skidmarks.push({
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      alpha: alpha || 0.45,
      life: 18.0
    });
  }

  VC.addSkidmark = addSkidmark;

  // Catalog of original vehicle types
  var VEHICLE_TYPES = {
    motorcycle: {
      name: 'VPD Motos',
      class: 'Pursuit Motorcycle',
      w: 24, h: 10, maxSpeed: 390, reverseSpeed: 80,
      accel: 410, brake: 560, turnSpeed: 4.2, grip: 10,
      driftFactor: 0.7, mass: 0.45,
      defaultColor: '#111827', roofColor: '#e5e7eb', glassColor: '#111827'
    },
    sable: {
      name: 'Sable',
      class: 'Executive Sedan',
      w: 48,
      h: 22,
      maxSpeed: 300,
      reverseSpeed: 110,
      accel: 280,
      brake: 450,
      turnSpeed: 2.7,
      grip: 11,
      driftFactor: 0.42,
      mass: 1.2,
      defaultColor: '#253549',
      roofColor: '#172230',
      glassColor: '#0a1520'
    },
    kestrel: {
      name: 'Kestrel',
      class: 'Sports Coupe',
      w: 46,
      h: 22,
      maxSpeed: 360,
      reverseSpeed: 120,
      accel: 360,
      brake: 520,
      turnSpeed: 3.2,
      grip: 13,
      driftFactor: 0.55,
      mass: 1.0,
      defaultColor: '#00d2d3',
      roofColor: '#019fa0',
      glassColor: '#061a22'
    },
    hauler: {
      name: 'Hauler',
      class: 'Cargo Van',
      w: 52,
      h: 25,
      maxSpeed: 230,
      reverseSpeed: 95,
      accel: 210,
      brake: 380,
      turnSpeed: 2.2,
      grip: 14,
      driftFactor: 0.3,
      mass: 1.8,
      defaultColor: '#78909c',
      roofColor: '#546e7a',
      glassColor: '#10171d'
    },
    cab: {
      name: 'City Cab',
      class: 'Vireo Taxi',
      w: 48,
      h: 22,
      maxSpeed: 290,
      reverseSpeed: 105,
      accel: 270,
      brake: 460,
      turnSpeed: 2.8,
      grip: 11,
      driftFactor: 0.4,
      mass: 1.2,
      defaultColor: '#f1c40f',
      roofColor: '#d4ac0d',
      glassColor: '#1a180e'
    },
    ranger: {
      name: 'Ranger',
      class: 'Utility Pickup',
      w: 50,
      h: 23,
      maxSpeed: 270,
      reverseSpeed: 100,
      accel: 260,
      brake: 420,
      turnSpeed: 2.5,
      grip: 12,
      driftFactor: 0.38,
      mass: 1.5,
      defaultColor: '#8d6e63',
      roofColor: '#6d4c41',
      glassColor: '#1a1412'
    },
    interceptor: {
      name: 'Interceptor',
      class: 'Police Cruiser',
      w: 50,
      h: 23,
      maxSpeed: 350,
      reverseSpeed: 125,
      accel: 340,
      brake: 520,
      turnSpeed: 3.0,
      grip: 12.5,
      driftFactor: 0.48,
      mass: 1.4,
      defaultColor: '#181e26',
      roofColor: '#f0f4f8',
      glassColor: '#0c1622'
    },
    ronin: {
      name: 'Ronin',
      class: 'Muscle Car',
      w: 48,
      h: 24,
      maxSpeed: 340,
      reverseSpeed: 115,
      accel: 380,
      brake: 460,
      turnSpeed: 2.6,
      grip: 9.5,
      driftFactor: 0.65,
      mass: 1.3,
      defaultColor: '#b71540',
      roofColor: '#8c1031',
      glassColor: '#1a0b12'
    }
  };

  VC.VEHICLE_TYPES = VEHICLE_TYPES;

  function Vehicle(typeKey, x, y, heading) {
    this.typeKey = typeKey || 'sable';
    var spec = VEHICLE_TYPES[this.typeKey] || VEHICLE_TYPES.sable;
    this.spec = spec;
    this.typeName = spec.name;
    this.carClass = spec.class;

    this.x = x || 0;
    this.y = y || 0;
    this.w = spec.w;
    this.h = spec.h;
    this.radius = Math.max(spec.w, spec.h) * 0.52;

    this.heading = heading !== undefined ? heading : 0;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.lateralVelocity = 0;

    this.steerAngle = 0;
    this.steerInput = 0;

    this.maxSpeed = spec.maxSpeed;
    this.reverseSpeed = spec.reverseSpeed;
    this.accel = spec.accel;
    this.brake = spec.brake;
    this.turnSpeed = spec.turnSpeed;
    this.grip = spec.grip;
    this.driftFactor = spec.driftFactor;
    this.mass = spec.mass;

    this.color = spec.defaultColor;
    this.roofColor = spec.roofColor;
    this.glassColor = spec.glassColor;

    this.health = 100;
    this.maxHealth = 100;
    this.lightsOn = true;
    this.sirenOn = this.typeKey === 'interceptor';
    this.sirenTimer = 0;

    this.driver = null; // player or null
    this.isDrifting = false;
    this.isBraking = false;
    this.isBoosting = false;

    // Previous tire contact points for skid marks
    this.lastWheelRL = null;
    this.lastWheelRR = null;

    this.damageFlash = 0;
    this.smokePuffTimer = 0;
    this.exploded = false;
    this.explosionChecked = false;
    this.roadblockStuck = 0;
  }

  Vehicle.prototype.getSpeedKmH = function() {
    return Math.round(Math.abs(this.speed) * 0.42);
  };

  Vehicle.prototype.applyControl = function(throttle, steer, handbrake, boost, dt) {
    this.steerInput = steer;
    this.isBraking = false;
    this.isBoosting = boost && throttle > 0;

    var effectiveAccel = this.accel;
    var effectiveMaxSpeed = this.maxSpeed;
    if (this.health < 45) {
      effectiveAccel *= 0.72;
      effectiveMaxSpeed *= 0.72;
    }
    if (this.isBoosting) {
      effectiveAccel *= 1.45;
      effectiveMaxSpeed *= 1.25;
    }

    // Forward / Reverse throttle and braking
    if (throttle > 0) {
      if (this.speed < -15) {
        // Braking while reversing
        this.speed += this.brake * dt * 1.5;
        this.isBraking = true;
      } else {
        // Accelerate forward
        this.speed += effectiveAccel * dt;
        if (this.speed > effectiveMaxSpeed) {
          this.speed = effectiveMaxSpeed;
        }
      }
    } else if (throttle < 0) {
      if (this.speed > 15) {
        // Braking while moving forward
        this.speed -= this.brake * dt;
        this.isBraking = true;
      } else {
        // Reverse
        this.speed -= (effectiveAccel * 0.65) * dt;
        if (this.speed < -this.reverseSpeed) {
          this.speed = -this.reverseSpeed;
        }
      }
    } else {
      // Natural rolling drag
      var drag = 120 * dt;
      if (this.speed > drag) {
        this.speed -= drag;
      } else if (this.speed < -drag) {
        this.speed += drag;
      } else {
        this.speed = 0;
      }
    }

    // Handbrake action
    if (handbrake) {
      this.isBraking = true;
      if (Math.abs(this.speed) > 10) {
        var hBrakeDecel = this.brake * 1.2 * dt;
        if (this.speed > 0) {
          this.speed = Math.max(0, this.speed - hBrakeDecel);
        } else {
          this.speed = Math.min(0, this.speed + hBrakeDecel);
        }
      }
    }

    // Steering physics
    // Steering is tighter at low/mid speeds, more stable at top speeds
    var speedRatio = Math.min(1.0, Math.abs(this.speed) / (this.maxSpeed * 0.6));
    var steerSensitivity = 1.0;
    if (Math.abs(this.speed) < 20) {
      steerSensitivity = Math.abs(this.speed) / 20;
    } else if (Math.abs(this.speed) > this.maxSpeed * 0.7) {
      steerSensitivity = 0.85;
    }

    var targetSteerAngle = steer * 0.42; // max ~24 degrees front wheel angle
    this.steerAngle += (targetSteerAngle - this.steerAngle) * (1 - Math.exp(-dt * 15));

    if (Math.abs(this.speed) > 5) {
      var reverseMult = this.speed >= 0 ? 1 : -1;
      var turnAmount = steer * this.turnSpeed * steerSensitivity * reverseMult * dt;
      if (handbrake && Math.abs(this.speed) > 50) {
        turnAmount *= 1.45; // extra spin out during handbrake
      }
      this.heading += turnAmount;
    }

    // Drift & lateral slip
    var forwardX = Math.cos(this.heading);
    var forwardY = Math.sin(this.heading);
    var rightX = -forwardY;
    var rightY = forwardX;

    var currentVx = this.vx;
    var currentVy = this.vy;
    var latVel = currentVx * rightX + currentVy * rightY;

    var gripMultiplier = handbrake ? (this.grip * (1 - this.driftFactor)) : this.grip;
    if (VC.weather) gripMultiplier *= VC.weather.getGripMultiplier();
    latVel *= Math.exp(-dt * gripMultiplier);

    this.lateralVelocity = latVel;
    this.vx = forwardX * this.speed + rightX * latVel;
    this.vy = forwardY * this.speed + rightY * latVel;

    this.isDrifting = (handbrake && Math.abs(this.speed) > 70) || (Math.abs(latVel) > 40);
  };

  Vehicle.prototype.damage = function(amount) {
    if (this.exploded) return;
    this.health = Math.max(0, this.health - amount);
    this.damageFlash = 0.22;
    if (VC.Audio) VC.Audio.gunshot();
    if (this.health <= 0) explodeVehicle(this);
  };


  Vehicle.prototype.repair = function(amount) {
    this.health = Math.min(this.maxHealth, this.health + (amount || 100));
  };

  Vehicle.prototype.update = function(dt, city) {
    if (this.roadblockStuck > 0) this.roadblockStuck = Math.max(0, this.roadblockStuck - dt);
    if (this.health <= 0 && !this.exploded) explodeVehicle(this);
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt);
    }

    // Interceptor siren flasher cycle
    if (this.sirenOn) {
      this.sirenTimer += dt * 8;
    }

    // Check skid marks generation
    if (this.isDrifting || (this.isBraking && Math.abs(this.speed) > 130)) {
      var cosH = Math.cos(this.heading);
      var sinH = Math.sin(this.heading);

      // Rear axle center
      var rearX = this.x - cosH * (this.w * 0.35);
      var rearY = this.y - sinH * (this.w * 0.35);
      var halfTrack = this.h * 0.42;

      var rlx = rearX - sinH * halfTrack;
      var rly = rearY + cosH * halfTrack;
      var rrx = rearX + sinH * halfTrack;
      var rry = rearY - cosH * halfTrack;

      if (this.lastWheelRL && this.lastWheelRR) {
        addSkidmark(this.lastWheelRL.x, this.lastWheelRL.y, rlx, rly, 0.45);
        addSkidmark(this.lastWheelRR.x, this.lastWheelRR.y, rrx, rry, 0.45);
      }

      this.lastWheelRL = { x: rlx, y: rly };
      this.lastWheelRR = { x: rrx, y: rry };
    } else {
      this.lastWheelRL = null;
      this.lastWheelRR = null;
    }

    // Advance position with axis collision
    if (city) {
      var nextX = this.x + this.vx * dt;
      var colX = VC.City.checkCollision(city, nextX, this.y, this.radius * 0.72);
      if (colX.hit) {
        nextX += colX.nx * colX.depth;
        var impactSpeed = Math.abs(this.speed);
        if (impactSpeed > 75) {
          this.damage(Math.round(impactSpeed * 0.12));
          this.speed = -this.speed * 0.32;
        } else {
          this.speed = 0;
        }
        this.vx = 0;
      }
      this.x = nextX;

      var nextY = this.y + this.vy * dt;
      var colY = VC.City.checkCollision(city, this.x, nextY, this.radius * 0.72);
      if (colY.hit) {
        nextY += colY.ny * colY.depth;
        var impactSpeedY = Math.abs(this.speed);
        if (impactSpeedY > 75) {
          this.damage(Math.round(impactSpeedY * 0.12));
          this.speed = -this.speed * 0.32;
        } else {
          this.speed = 0;
        }
        this.vy = 0;
      }
      this.y = nextY;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
  };

  Vehicle.prototype.render = function(ctx, timeSec) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);

    var w = this.w;
    var h = this.h;
    var hw = w / 2;
    var hh = h / 2;

    // 1. Soft blurred drop shadow underneath
    ctx.save();
    ctx.shadowColor = 'rgba(1, 3, 7, 0.88)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = 'rgba(2, 4, 8, 0.75)';
    VC.roundRect(ctx, -hw - 2, -hh - 1, w + 4, h + 2, 7);
    ctx.fill();
    ctx.restore();

    // Clear road illumination: bright headlight cones make the vehicle read as
    // an escaping player car or an active police pursuit at thumbnail scale.
    if (this.lightsOn) {
      var isKestrel = this.typeKey === 'kestrel';
      var isInterceptor = this.typeKey === 'interceptor';
      var beamLength = isKestrel ? 88 : (isInterceptor ? 58 : 48);
      var beamWidth = isKestrel ? 30 : 18;
      var beam = ctx.createLinearGradient(hw, 0, hw + beamLength, 0);
      beam.addColorStop(0, isKestrel ? 'rgba(255,255,225,0.82)' : 'rgba(210,238,255,0.62)');
      beam.addColorStop(0.38, 'rgba(225,242,255,0.38)');
      beam.addColorStop(1, 'rgba(180,220,255,0)');
      ctx.save();
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(hw - 2, -hh + 5);
      ctx.lineTo(hw + beamLength, -beamWidth);
      ctx.lineTo(hw + beamLength, beamWidth);
      ctx.lineTo(hw - 2, hh - 5);
      ctx.closePath();
      ctx.fill();

      if (isKestrel) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.98)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#eaffff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(hw - 1, -hh + 4);
        ctx.lineTo(hw + beamLength, -beamWidth * 0.62);
        ctx.moveTo(hw - 1, hh - 4);
        ctx.lineTo(hw + beamLength, beamWidth * 0.62);
        ctx.stroke();
        ctx.restore();
      }
      if (isKestrel) {
        ctx.strokeStyle = 'rgba(255,255,235,0.92)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fffbd0';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(hw - 1, -hh + 6);
        ctx.lineTo(hw + beamLength, -beamWidth * 0.48);
        ctx.moveTo(hw - 1, hh - 6);
        ctx.lineTo(hw + beamLength, beamWidth * 0.48);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.typeKey === 'kestrel' && this.driver === VC.player) {
      ctx.save();
      ctx.strokeStyle = 'rgba(230,255,255,1)';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#aefaff';
      ctx.shadowBlur = 12;
      VC.roundRect(ctx, -hw - 2, -hh - 2, w + 4, h + 4, 7);
      ctx.stroke();
      ctx.restore();
    }

    if (this.typeKey === 'kestrel' && this.driver === VC.player) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#fff4ba';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-w * 0.18, -hh + 2);
      ctx.lineTo(w * 0.18, -hh + 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(205,252,255,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w * 0.12, -hh + 4);
      ctx.lineTo(w * 0.22, -hh + 4);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Wheels (Tires with rims, front wheels turn with steer angle)
    var wheelW = w * 0.22;
    var wheelH = 4.5;
    var frontAxleX = hw - wheelW * 0.85;
    var rearAxleX = -hw + wheelW * 0.85;
    var trackY = hh - 1;

    // Render 4 wheels
    this.renderWheel(ctx, frontAxleX, -trackY, wheelW, wheelH, this.steerAngle);
    this.renderWheel(ctx, frontAxleX, trackY, wheelW, wheelH, this.steerAngle);
    this.renderWheel(ctx, rearAxleX, -trackY, wheelW, wheelH, 0);
    this.renderWheel(ctx, rearAxleX, trackY, wheelW, wheelH, 0);

    // 3. Dark outline silhouette base
    ctx.fillStyle = '#060a10';
    VC.roundRect(ctx, -hw - 1, -hh - 1, w + 2, h + 2, 6);
    ctx.fill();

    // 4. Main Body Paint
    var bodyColor = this.damageFlash > 0 ? '#ff3344' : this.color;
    ctx.fillStyle = bodyColor;
    VC.roundRect(ctx, -hw, -hh, w, h, 5);
    ctx.fill();

    // Subtle edge highlight on body
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    VC.roundRect(ctx, -hw + 1, -hh + 1, w - 2, h - 2, 4);
    ctx.stroke();

    // 5. Type-Specific Body Details
    if (this.typeKey === 'cab') {
      // City Cab: Checker side stripes
      ctx.fillStyle = '#111111';
      for (var chx = -hw + 8; chx < hw - 8; chx += 8) {
        ctx.fillRect(chx, -hh + 2, 4, 2);
        ctx.fillRect(chx + 4, hh - 4, 4, 2);
      }
    } else if (this.typeKey === 'ronin') {
      // Ronin Muscle: Twin racing stripes
      ctx.fillStyle = 'rgba(240, 245, 255, 0.85)';
      ctx.fillRect(-hw, -4.5, w, 2.5);
      ctx.fillRect(-hw, 2, w, 2.5);

      // Hood scoop
      ctx.fillStyle = '#11151c';
      ctx.fillRect(hw * 0.15, -4, hw * 0.35, 8);
    } else if (this.typeKey === 'ranger') {
      // Ranger: Open pickup bed cutout
      ctx.fillStyle = '#1c222b';
      VC.roundRect(ctx, -hw + 3, -hh + 3, w * 0.44, h - 6, 2);
      ctx.fill();
      ctx.strokeStyle = '#11151a';
      ctx.stroke();
    } else if (this.typeKey === 'interceptor') {
      // Police Cruiser: White front doors & roof
      ctx.fillStyle = '#f0f4f8';
      VC.roundRect(ctx, -hw * 0.35, -hh, w * 0.5, h, 2);
      ctx.fill();

      // Front push bumper / bullbar
      ctx.fillStyle = '#1a222d';
      ctx.fillRect(hw - 2, -hh + 4, 4, h - 8);
      ctx.fillRect(hw, -hh + 6, 3, 2);
      ctx.fillRect(hw, hh - 8, 3, 2);
    } else if (this.typeKey === 'hauler') {
      // Hauler Van: Cargo roof ribs
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (var rbx = -hw + 10; rbx < hw - 12; rbx += 6) {
        ctx.beginPath();
        ctx.moveTo(rbx, -hh + 4);
        ctx.lineTo(rbx, hh - 4);
        ctx.stroke();
      }
    }

    // 6. Cabin Glass & Roof Greenhouse
    var cabinW = w * 0.55;
    var cabinH = h * 0.76;
    var cabinX = -hw + w * 0.22;
    var cabinY = -cabinH / 2;

    if (this.typeKey === 'kestrel') {
      // Sleek swept-back sports coupe cabin
      cabinW = w * 0.48;
      cabinX = -hw + w * 0.24;
    } else if (this.typeKey === 'hauler') {
      // Van long cabin
      cabinW = w * 0.75;
      cabinX = -hw + w * 0.15;
    } else if (this.typeKey === 'ranger') {
      // Pickup front cab only
      cabinW = w * 0.36;
      cabinX = hw * 0.05;
    }

    // Tinted glass perimeter
    ctx.fillStyle = this.glassColor || '#0a1420';
    VC.roundRect(ctx, cabinX, cabinY, cabinW, cabinH, 3);
    ctx.fill();

    // Roof painted cap
    var roofW = cabinW * 0.65;
    var roofH = cabinH * 0.78;
    var roofX = cabinX + (cabinW - roofW) * 0.45;
    var roofY = -roofH / 2;

    ctx.fillStyle = this.roofColor;
    VC.roundRect(ctx, roofX, roofY, roofW, roofH, 2);
    ctx.fill();

    // Windshield specular glass highlight (diagonal glare streak)
    ctx.fillStyle = 'rgba(180, 220, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(cabinX + cabinW - 2, cabinY + 2);
    ctx.lineTo(cabinX + cabinW - 6, cabinY + 2);
    ctx.lineTo(cabinX + cabinW - 10, cabinY + cabinH - 2);
    ctx.lineTo(cabinX + cabinW - 6, cabinY + cabinH - 2);
    ctx.closePath();
    ctx.fill();

    // 7. Roof Props / Signage
    if (this.typeKey === 'cab') {
      // Illuminated TAXI sign on roof
      ctx.save();
      ctx.fillStyle = '#ffaa00';
      ctx.shadowColor = 'rgba(255, 170, 0, 0.8)';
      ctx.shadowBlur = 8;
      VC.roundRect(ctx, roofX + roofW / 2 - 6, -3.5, 12, 7, 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#111111';
      ctx.font = 'bold 5px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', roofX + roofW / 2, 0);
    } else if (this.typeKey === 'interceptor') {
      // Flashing police emergency lightbar
      var strobePhase = Math.floor((this.sirenTimer || 0)) % 2;
      var leftBlue = strobePhase === 0;

      // Lightbar base
      ctx.fillStyle = '#222831';
      ctx.fillRect(roofX + roofW / 2 - 3, -hh * 0.65, 6, hh * 1.3);

      // Left blue LED strobe
      ctx.save();
      ctx.fillStyle = leftBlue ? '#00e5ff' : '#003366';
      if (leftBlue) {
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 12;
      }
      ctx.fillRect(roofX + roofW / 2 - 2.5, -hh * 0.6, 5, hh * 0.55);
      ctx.restore();

      // Right red LED strobe
      ctx.save();
      ctx.fillStyle = !leftBlue ? '#ff1744' : '#660011';
      if (!leftBlue) {
        ctx.shadowColor = '#ff1744';
        ctx.shadowBlur = 12;
      }
      ctx.fillRect(roofX + roofW / 2 - 2.5, hh * 0.05, 5, hh * 0.55);
      ctx.restore();
    }

    // 8. Headlights (front edge)
    var headW = 3;
    var headH = 4;
    var headColor = this.lightsOn ? '#fffbe6' : '#8892a0';

    ctx.fillStyle = headColor;
    ctx.fillRect(hw - headW, -hh + 2.5, headW, headH);
    ctx.fillRect(hw - headW, hh - headH - 2.5, headW, headH);

    // 9. Taillights (rear edge)
    var tailW = 2.5;
    var tailH = 4;
    var tailColor = VC.PALETTE.taillightRed;
    var tailGlow = this.isBraking ? 'rgba(255, 30, 60, 0.9)' : VC.PALETTE.taillightGlow;

    ctx.save();
    ctx.fillStyle = tailColor;
    ctx.shadowColor = tailGlow;
    ctx.shadowBlur = this.isBraking ? 10 : 5;
    ctx.fillRect(-hw, -hh + 2.5, tailW, tailH);
    ctx.fillRect(-hw, hh - tailH - 2.5, tailW, tailH);
    ctx.restore();

    // 10. Damage Smoke / Fire (if low health)
    if (this.health < 45) {
      ctx.save();
      var smokeAlpha = (1 - this.health / 45) * 0.65;
      ctx.fillStyle = 'rgba(25, 30, 40, ' + smokeAlpha + ')';
      ctx.beginPath();
      ctx.arc(hw * 0.6, 0, 7 + Math.sin((timeSec || 0) * 10) * 3, 0, Math.PI * 2);
      ctx.fill();
      if (this.health < 25) {
        ctx.fillStyle = '#ff5722';
        ctx.beginPath();
        ctx.arc(hw * 0.6, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  };

  Vehicle.prototype.renderWheel = function(ctx, x, y, w, h, steerAngle) {
    ctx.save();
    ctx.translate(x, y);
    if (steerAngle) {
      ctx.rotate(steerAngle);
    }
    // Rubber tire
    ctx.fillStyle = '#141820';
    VC.roundRect(ctx, -w / 2, -h / 2, w, h, 1.5);
    ctx.fill();

    // Rim center
    ctx.fillStyle = '#607084';
    ctx.fillRect(-w * 0.25, -h * 0.25, w * 0.5, h * 0.5);
    ctx.restore();
  };

  VC.Vehicle = Vehicle;

  function spawnExplosion(x, y, strength) {
    strength = Math.max(0.35, Math.min(1, strength || 0.65));
    vehicleExplosions.push({
      x: x, y: y, radius: 48 * strength, life: 0.90, maxLife: 0.90,
      flash: 1, strength: strength
    });
    for (var i = 0; i < 18; i++) {
      var ang = (i / 18) * Math.PI * 2 + i * 0.37;
      var spd = (55 + (i % 5) * 31) * strength;
      explosionFragments.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 18,
        life: 0.55 + (i % 7) * 0.09,
        maxLife: 1.16,
        size: 1.5 + (i % 4) * 1.1
      });
    }
  }

  function explodeVehicle(vehicle) {
    if (!vehicle || vehicle.exploded) return;
    vehicle.exploded = true;
    vehicle.health = 0;
    vehicle.speed = 0;
    vehicle.vx = 0;
    vehicle.vy = 0;

    vehicleExplosions.push({
      x: vehicle.x, y: vehicle.y, radius: 48, life: 0.9, maxLife: 0.9,
      flash: 1
    });
    for (var i = 0; i < 28; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 70 + Math.random() * 220;
      explosionFragments.push({
        x: vehicle.x, y: vehicle.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 0.5 + Math.random() * 1.1,
        maxLife: 1.6,
        size: 2 + Math.random() * 5
      });
    }

    if (VC.Audio) {
      VC.Audio.explosion();
      VC.Audio.startSiren();
    }
    if (VC.hud) VC.hud.toast('VEHICLE EXPLOSION // UNITS ON ALERT', 2.8);
    if (VC.camera) {
      var cameraDist = VC.player ? Math.hypot(VC.player.x - vehicle.x, VC.player.y - vehicle.y) : 999;
      var shakeAmount = Math.max(2, 12 * (1 - Math.min(1, cameraDist / 700)));
      VC.camera.shake(shakeAmount, 0.32);
    }

    if (VC.wanted) {
      var cur = VC.wanted.level;
      VC.wanted.setLevel(Math.min(5, cur + 1), VC.player);
    }

    var blastRadius = 190;
    if (VC.player) {
      var pd = Math.hypot(VC.player.x - vehicle.x, VC.player.y - vehicle.y);
      if (pd < blastRadius && VC.combat) {
        VC.combat.applyDamage(VC.player, Math.round(25 * (1 - pd / blastRadius)), vehicle.x, vehicle.y);
      }
    }
    if (VC.traffic) {
      for (var t = VC.traffic.vehicles.length - 1; t >= 0; t--) {
        var tv = VC.traffic.vehicles[t].vehicle;
        if (tv !== vehicle && Math.hypot(tv.x - vehicle.x, tv.y - vehicle.y) < blastRadius) {
          tv.damage(45);
        }
      }
    }
    if (VC.police) {
      for (var c = VC.police.cruisers.length - 1; c >= 0; c--) {
        var pv = VC.police.cruisers[c].vehicle;
        if (Math.hypot(pv.x - vehicle.x, pv.y - vehicle.y) < blastRadius) pv.damage(55);
      }
      for (var f = 0; f < VC.police.footOfficers.length; f++) {
        var fo = VC.police.footOfficers[f];
        if (Math.hypot(fo.x - vehicle.x, fo.y - vehicle.y) < blastRadius && VC.combat) {
          fo.health = Math.max(0, fo.health - 30);
        }
      }
    }
  }

  function updateExplosionEffects(dt) {
    for (var i = vehicleExplosions.length - 1; i >= 0; i--) {
      vehicleExplosions[i].life -= dt;
      vehicleExplosions[i].radius += dt * 95;
      if (vehicleExplosions[i].radius > 80) vehicleExplosions[i].radius = 80;
      if (vehicleExplosions[i].life <= 0) vehicleExplosions.splice(i, 1);
    }
    for (var j = explosionFragments.length - 1; j >= 0; j--) {
      var p = explosionFragments[j];
      p.life -= dt;
      p.vx *= Math.max(0, 1 - dt * 1.4);
      p.vy *= Math.max(0, 1 - dt * 1.4);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) explosionFragments.splice(j, 1);
    }
  }

  function renderExplosionEffects(ctx) {
    for (var i = 0; i < vehicleExplosions.length; i++) {
      var e = vehicleExplosions[i];
      var alpha = Math.max(0, e.life / e.maxLife);
      ctx.save();
      ctx.fillStyle = 'rgba(255,215,90,' + (alpha * 0.16) + ')';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 16, e.radius * 0.82, e.radius * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();

      var g = ctx.createRadialGradient(e.x, e.y, 3, e.x, e.y, e.radius * 0.68);
      g.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
      g.addColorStop(0.18, 'rgba(255,238,120,' + (alpha * 0.98) + ')');
      g.addColorStop(0.48, 'rgba(255,105,18,' + (alpha * 0.92) + ')');
      g.addColorStop(0.78, 'rgba(155,26,8,' + (alpha * 0.38) + ')');
      g.addColorStop(1, 'rgba(20,8,8,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y - 8, e.radius * 0.68, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,196,92,' + (alpha * 0.82) + ')';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#ff8a18';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(60, Math.min(80, e.radius)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (var s = 0; s < 7; s++) {
        var sx = e.x + ((s % 3) - 1) * (12 + s * 2);
        var sy = e.y - 28 - s * 13 - (1 - alpha) * 18;
        ctx.save();
        ctx.globalAlpha = alpha * (0.82 - s * 0.07);
        ctx.fillStyle = s < 3 ? '#25252a' : '#17191e';
        ctx.beginPath();
        ctx.arc(sx, sy, 9 + s * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    for (var j = 0; j < explosionFragments.length; j++) {
      var p = explosionFragments[j];
      ctx.fillStyle = 'rgba(255,' + (120 + Math.floor(100 * p.life / p.maxLife)) + ',40,0.9)';
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  VC.explodeVehicle = explodeVehicle;
  VC.spawnExplosion = spawnExplosion;
  VC.updateVehicleEffects = updateExplosionEffects;
  VC.renderVehicleEffects = renderExplosionEffects;
})();
