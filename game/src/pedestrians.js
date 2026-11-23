// Pedestrian simulation, sidewalk navigation, and crowd reactions for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var STEP = 334;
  var BLOCK_SIZE = 260;
  var ROAD_WIDTH = 74;
  var SIDEWALK_WIDTH = 16;
  var MAX_PEDESTRIANS = 24;
  var SPAWN_RADIUS_MIN = 220;
  var SPAWN_RADIUS_MAX = 780;
  var DESPAWN_RADIUS = 1050;

  var SHIRT_PALETTE = [
    '#00f0ff', '#ff007f', '#39ff14', '#ffaa00',
    '#ffffff', '#e0e6ed', '#ff5252', '#7c4dff',
    '#00e676', '#ffd740', '#ff4081', '#40c4ff'
  ];

  var PANTS_PALETTE = [
    '#101520', '#1c2436', '#253342', '#37474f',
    '#212121', '#263238', '#1a237e'
  ];

  var SKIN_PALETTE = [
    '#f5d0b5', '#e0a98b', '#c68661', '#8d5524', '#e8b89d'
  ];

  var HAIR_PALETTE = [
    '#111111', '#2c1e14', '#4a2c11', '#8d6e63', '#d7ccc8', '#ffb74d'
  ];

  function Pedestrian(x, y, heading) {
    var pedRng = VC.RNG && VC.RNG.stream ? VC.RNG.stream('pedestrians') : null;
    var random = function() { return pedRng ? pedRng.random() : Math.random(); };
    var randInt = function(min, max) { return pedRng ? pedRng.randInt(min, max) : Math.floor(random() * (max - min + 1)) + min; };
    this.rng = pedRng;
    this.x = x || 0;
    this.y = y || 0;
    this.vx = 0;
    this.vy = 0;
    this.heading = heading || 0;
    this.radius = 8;

    this.walkSpeed = 48 + random() * 22;
    this.sprintSpeed = 135;
    this.walkPhase = random() * Math.PI * 2;

    // States: 'walking', 'crossing', 'dodging', 'fleeing', 'cowering'
    this.state = 'walking';
    this.stateTimer = 0;

    // Sidewalk strip orientation: 'h' (horizontal sidewalk) or 'v' (vertical)
    this.walkAxis = 'h';
    this.walkDir = random() > 0.5 ? 1 : -1;

    // Appearance
    this.shirtColor = SHIRT_PALETTE[randInt(0, SHIRT_PALETTE.length - 1)];
    this.pantsColor = PANTS_PALETTE[randInt(0, PANTS_PALETTE.length - 1)];
    this.skinColor = SKIN_PALETTE[randInt(0, SKIN_PALETTE.length - 1)];
    this.hairColor = HAIR_PALETTE[randInt(0, HAIR_PALETTE.length - 1)];
    this.hasHat = random() < 0.25;
    this.hatColor = this.shirtColor;
    this.umbrellaColor = randInt(0, 1) ? '#ff007f' : '#00f0ff';

    this.cowerShake = 0;
  }

  Pedestrian.prototype.update = function(dt, city, player, vehicles) {
    // 1. Process reactions & threat detection
    this.checkThreats(dt, player, vehicles);

    // 2. State-specific behavior
    var curSpeed = this.walkSpeed;
    if (VC.weather && VC.weather.isRaining()) {
      curSpeed *= 1.2;
      this.hasUmbrella = true;
    } else {
      this.hasUmbrella = false;
    }

    if (this.state === 'cowering') {
      curSpeed = 0;
      this.cowerShake += dt * 18;
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'walking';
      }
    } else if (this.state === 'dodging') {
      curSpeed = this.sprintSpeed * 1.1;
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'walking';
      }
    } else if (this.state === 'fleeing') {
      curSpeed = this.sprintSpeed;
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'walking';
      }
    } else {
      // Normal walking or crossing
      this.updateSidewalkNavigation(dt, city);
    }

    // Advance movement physics
    this.vx = Math.cos(this.heading) * curSpeed;
    this.vy = Math.sin(this.heading) * curSpeed;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Advance walk cycle animation
    if (curSpeed > 10) {
      this.walkPhase += dt * (curSpeed > 100 ? 16 : 8);
    }
  };

  Pedestrian.prototype.checkThreats = function(dt, player, vehicles) {
    // A. Vehicle near-miss / collision avoidance
    if (vehicles && vehicles.length > 0) {
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        var vSpeed = Math.abs(v.speed);
        if (vSpeed < 35) continue;

        var dx = this.x - v.x;
        var dy = this.y - v.y;
        var dist = Math.hypot(dx, dy);

        if (dist < 72) {
          // Check if vehicle is coming towards pedestrian
          var vForwardX = Math.cos(v.heading);
          var vForwardY = Math.sin(v.heading);
          var forwardDot = dx * vForwardX + dy * vForwardY;

          if (forwardDot > -10 && forwardDot < 65) {
            // Dodge laterally out of the car's path
            var rightX = -vForwardY;
            var rightY = vForwardX;
            var lateralDot = dx * rightX + dy * rightY;
            var dodgeSide = lateralDot >= 0 ? 1 : -1;

            this.heading = Math.atan2(rightY * dodgeSide, rightX * dodgeSide);
            this.state = 'dodging';
            this.stateTimer = 0.85;
            return;
          }
        }
      }
    }

    // B. Player driven vehicle danger
    if (player && player.vehicle) {
      var pv = player.vehicle;
      if (Math.abs(pv.speed) > 40) {
        var pdx = this.x - pv.x;
        var pdy = this.y - pv.y;
        var pDist = Math.hypot(pdx, pdy);
        if (pDist < 80) {
          var pForwardX = Math.cos(pv.heading);
          var pForwardY = Math.sin(pv.heading);
          var pDot = pdx * pForwardX + pdy * pForwardY;
          if (pDot > -10 && pDot < 70) {
            var pRightX = -pForwardY;
            var pRightY = pForwardX;
            var pLat = pdx * pRightX + pdy * pRightY;
            var pSide = pLat >= 0 ? 1 : -1;
            this.heading = Math.atan2(pRightY * pSide, pRightX * pSide);
            this.state = 'dodging';
            this.stateTimer = 1.0;
            return;
          }
        }
      }
    }

    // C. Gunfire / High Wanted Level / Police Chase
    if (player && player.wantedLevel >= 2) {
      var dPlayerX = this.x - player.x;
      var dPlayerY = this.y - player.y;
      var dPlayerDist = Math.hypot(dPlayerX, dPlayerY);

      if (dPlayerDist < 260 && this.state !== 'cowering' && this.state !== 'fleeing') {
        var pedRng = VC.RNG && VC.RNG.stream ? VC.RNG.stream('pedestrians') : null;
        if ((pedRng ? pedRng.random() : Math.random()) < 0.4) {
          this.state = 'cowering';
          this.stateTimer = 3.5 + (pedRng ? pedRng.random() : Math.random()) * 2.5;
        } else {
          this.state = 'fleeing';
          this.stateTimer = 4.0;
          this.heading = Math.atan2(dPlayerY, dPlayerX);
        }
      }
    }
  };

  Pedestrian.prototype.updateSidewalkNavigation = function(dt, city) {
    // If crossing the road, stay on path across crosswalk
    if (this.state === 'crossing') {
      return;
    }

    // Keep heading aligned with current sidewalk axis
    if (this.walkAxis === 'h') {
      this.heading = this.walkDir === 1 ? 0 : Math.PI;
    } else {
      this.heading = this.walkDir === 1 ? Math.PI / 2 : -Math.PI / 2;
    }

    // Corner turnaround / crosswalk transition
    var blockCol = Math.floor(this.x / STEP);
    var blockRow = Math.floor(this.y / STEP);
    var bx = blockCol * STEP + ROAD_WIDTH;
    var by = blockRow * STEP + ROAD_WIDTH;

    // Check if reaching the end of the block sidewalk
    if (this.walkAxis === 'h') {
      if (this.walkDir === 1 && this.x > bx + BLOCK_SIZE + 6) {
        if ((this.rng ? this.rng.random() : Math.random()) < 0.45) {
          // Turn onto vertical sidewalk
          this.walkAxis = 'v';
          this.walkDir = 1;
        } else {
          // Cross street east
          this.state = 'crossing';
          this.stateTimer = (ROAD_WIDTH + 24) / this.walkSpeed;
          setTimeout(function(ped) {
            ped.state = 'walking';
          }, (ROAD_WIDTH + 20) / this.walkSpeed * 1000, this);
        }
      } else if (this.walkDir === -1 && this.x < bx - 6) {
        if ((this.rng ? this.rng.random() : Math.random()) < 0.45) {
          this.walkAxis = 'v';
          this.walkDir = -1;
        } else {
          this.state = 'crossing';
        }
      }
    } else {
      if (this.walkDir === 1 && this.y > by + BLOCK_SIZE + 6) {
        if ((this.rng ? this.rng.random() : Math.random()) < 0.45) {
          this.walkAxis = 'h';
          this.walkDir = -1;
        } else {
          this.state = 'crossing';
        }
      } else if (this.walkDir === -1 && this.y < by - 6) {
        if ((this.rng ? this.rng.random() : Math.random()) < 0.45) {
          this.walkAxis = 'h';
          this.walkDir = 1;
        } else {
          this.state = 'crossing';
        }
      }
    }
  };

  Pedestrian.prototype.render = function(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.downed) {
      ctx.rotate(this.heading || -1);
      ctx.fillStyle = 'rgba(76,8,20,0.55)';
      ctx.beginPath();
      ctx.ellipse(-1, 6, 15, 6, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(98,12,32,0.82)';
      ctx.beginPath();
      ctx.ellipse(-2, 3, 17, 7, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#351d2a';
      ctx.beginPath();
      ctx.ellipse(1, 0, 10, 4, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#35202a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, -1);
      ctx.lineTo(-18, -8);
      ctx.moveTo(7, 1);
      ctx.lineTo(18, 8);
      ctx.stroke();
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-5, 3);
      ctx.lineTo(-16, 11);
      ctx.moveTo(6, 3);
      ctx.lineTo(15, -9);
      ctx.stroke();
      ctx.fillStyle = '#181015';
      ctx.beginPath();
      ctx.arc(-12, -2, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d4a070';
      ctx.beginPath();
      ctx.arc(-13, -1, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(112,17,38,0.78)';
      ctx.beginPath();
      ctx.ellipse(-8, 10, 13, 5, -0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // 1. Soft blurred drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(1, 3, 6, 0.82)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(2, 4, 8, 0.65)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rotate with heading
    ctx.rotate(this.heading);

    if (this.hasUmbrella) {
      ctx.save();
      ctx.shadowColor = this.umbrellaColor;
      ctx.shadowBlur = 5;
      ctx.fillStyle = this.umbrellaColor || '#101827';
      ctx.beginPath();
      ctx.arc(0, -13, 13, Math.PI, 0);
      ctx.lineTo(11, -13);
      ctx.lineTo(-11, -13);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8bdcff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(0, 7);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Animated Legs
    var walkSin = Math.sin(this.walkPhase);
    var legOffset1 = (this.state === 'cowering') ? 0 : walkSin * 4.5;
    var legOffset2 = (this.state === 'cowering') ? 0 : -walkSin * 4.5;

    ctx.fillStyle = this.pantsColor;
    // Left leg
    ctx.fillRect(-3 + legOffset1, -5.5, 4, 3.5);
    // Right leg
    ctx.fillRect(-3 + legOffset2, 2.0, 4, 3.5);

    // 3. Torso / Shirt
    var shakeX = (this.state === 'cowering') ? Math.sin(this.cowerShake) * 1.5 : 0;
    ctx.fillStyle = this.shirtColor;
    VC.roundRect(ctx, -5 + shakeX, -5.5, 10, 11, 3);
    ctx.fill();

    // 4. Arms
    if (this.state === 'cowering') {
      // Hands held tightly over head
      ctx.fillStyle = this.skinColor;
      ctx.beginPath();
      ctx.arc(2 + shakeX, -3, 2.5, 0, Math.PI * 2);
      ctx.arc(2 + shakeX, 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Arms swinging
      var armOffset = (this.state === 'fleeing') ? walkSin * 6 : walkSin * 3;
      ctx.fillStyle = this.shirtColor;
      ctx.fillRect(-1 - armOffset, -6.5, 3.5, 2.5);
      ctx.fillRect(-1 + armOffset, 4.0, 3.5, 2.5);

      // Hands
      ctx.fillStyle = this.skinColor;
      ctx.beginPath();
      ctx.arc(2 - armOffset, -5.5, 1.8, 0, Math.PI * 2);
      ctx.arc(2 + armOffset, 5.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Head & Hair / Hat
    ctx.fillStyle = this.skinColor;
    ctx.beginPath();
    ctx.arc(0 + shakeX, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();

    if (this.hasHat) {
      ctx.fillStyle = this.hatColor;
      ctx.beginPath();
      ctx.arc(-1 + shakeX, 0, 4.4, 0, Math.PI * 2);
      ctx.fill();
      // Cap visor
      ctx.fillRect(1 + shakeX, -2.5, 3, 5);
    } else {
      ctx.fillStyle = this.hairColor;
      ctx.beginPath();
      ctx.arc(-1.2 + shakeX, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  var PedestrianManager = {
    pedestrians: [],
    spawnTimer: 0,

    seedShotCrowd: function(num, player) {
      if (!player) return;
      var offsets = [
        [-105,-82,'h',1], [105,-70,'h',-1], [-150,48,'v',1], [145,58,'v',-1],
        [-55,118,'h',1], [55,132,'h',-1], [-95,-125,'v',-1], [92,-140,'v',1],
        [-175,-28,'h',1], [175,-18,'h',-1], [18,-155,'v',1], [-20,155,'v',-1],
        [205,95,'h',-1], [-205,92,'h',1], [128,170,'v',-1], [-128,-155,'v',1]
        ,[220,-55,'h',-1], [-220,-62,'h',1], [42,205,'v',-1], [-42,-205,'v',1],
        [188,-188,'h',1], [-188,188,'h',-1]
      ];
      this.pedestrians = [];
      for (var i = 0; i < Math.min(num, offsets.length); i++) {
        var o = offsets[i];
        var ped = new Pedestrian(player.x + o[0], player.y + o[1], o[3] === 1 ? 0 : Math.PI);
        ped.walkAxis = o[2];
        ped.walkDir = o[3];
        ped.hasUmbrella = true;
        ped.umbrellaColor = i % 3 === 0 ? '#ff007f' : (i % 3 === 1 ? '#00f0ff' : '#ffcc44');
        if (i % 4 === 1 || i % 5 === 2) {
          ped.state = 'fleeing';
          ped.stateTimer = 3.5;
          ped.heading = i % 2 ? Math.PI : 0;
        }
        this.pedestrians.push(ped);
      }
    },

    init: function() {
      this.pedestrians = [];
      this.spawnTimer = 0;
    },

    clear: function() {
      this.pedestrians = [];
    },

    initDeterministic: function(city, player) {
      this.pedestrians = [];
      if (!city) return;

      var px = player ? player.x : 740;
      var py = player ? player.y : 705;

      // Deterministic placement on sidewalks around the player
      var initialPeds = [
        { dx: -70, dy: -45, axis: 'h', dir: 1, shirt: '#00f0ff' },
        { dx: 50, dy: -45, axis: 'h', dir: -1, shirt: '#ff007f' },
        { dx: 110, dy: -45, axis: 'h', dir: 1, shirt: '#39ff14' },
        { dx: -120, dy: 65, axis: 'h', dir: 1, shirt: '#ffaa00' },
        { dx: -45, dy: 80, axis: 'v', dir: 1, shirt: '#ffffff' },
        { dx: 65, dy: 95, axis: 'v', dir: -1, shirt: '#7c4dff' },
        { dx: -45, dy: -110, axis: 'v', dir: -1, shirt: '#00e676' },
        { dx: 80, dy: -130, axis: 'v', dir: 1, shirt: '#ffd740' }
      ];

      for (var i = 0; i < initialPeds.length; i++) {
        var ip = initialPeds[i];
        var ped = new Pedestrian(px + ip.dx, py + ip.dy, ip.dir === 1 ? 0 : Math.PI);
        ped.walkAxis = ip.axis;
        ped.walkDir = ip.dir;
        ped.shirtColor = ip.shirt;
        this.pedestrians.push(ped);
      }
    },

    spawnPedestrianAround: function(city, focusX, focusY, rng) {
      if (this.pedestrians.length >= MAX_PEDESTRIANS || !city) return;

      var rand = rng || (VC.RNG && VC.RNG.stream ? VC.RNG.stream('pedestrians') : new VC.Mulberry32(1986));
      // Pick a random block near focus
      var blockCandidates = [];
      for (var b = 0; b < city.blocks.length; b++) {
        var blk = city.blocks[b];
        var bcx = blk.x + BLOCK_SIZE / 2;
        var bcy = blk.y + BLOCK_SIZE / 2;
        var dist = Math.hypot(bcx - focusX, bcy - focusY);
        if (dist >= SPAWN_RADIUS_MIN && dist <= SPAWN_RADIUS_MAX) {
          blockCandidates.push(blk);
        }
      }

      if (blockCandidates.length === 0) return;
      var chosenBlock = rand.randChoice(blockCandidates);

      // Choose North, South, West or East sidewalk edge
      var side = rand.randChoice(['N', 'S', 'W', 'E']);
      var sx = 0;
      var sy = 0;
      var sAxis = 'h';
      var sDir = rand.randChoice([1, -1]);

      if (side === 'N') {
        sx = chosenBlock.x + rand.randFloat(10, BLOCK_SIZE - 10);
        sy = chosenBlock.y - SIDEWALK_WIDTH / 2;
        sAxis = 'h';
      } else if (side === 'S') {
        sx = chosenBlock.x + rand.randFloat(10, BLOCK_SIZE - 10);
        sy = chosenBlock.y + BLOCK_SIZE + SIDEWALK_WIDTH / 2;
        sAxis = 'h';
      } else if (side === 'W') {
        sx = chosenBlock.x - SIDEWALK_WIDTH / 2;
        sy = chosenBlock.y + rand.randFloat(10, BLOCK_SIZE - 10);
        sAxis = 'v';
      } else {
        sx = chosenBlock.x + BLOCK_SIZE + SIDEWALK_WIDTH / 2;
        sy = chosenBlock.y + rand.randFloat(10, BLOCK_SIZE - 10);
        sAxis = 'v';
      }

      var ped = new Pedestrian(sx, sy, 0);
      ped.walkAxis = sAxis;
      ped.walkDir = sDir;
      this.pedestrians.push(ped);
    },

    update: function(dt, city, player, trafficVehicles) {
      if (!city) return;

      var focusX = player ? player.x : 740;
      var focusY = player ? player.y : 705;

      // Despawn far pedestrians
      for (var d = this.pedestrians.length - 1; d >= 0; d--) {
        var p = this.pedestrians[d];
        var dist = Math.hypot(p.x - focusX, p.y - focusY);
        if (dist > DESPAWN_RADIUS) {
          this.pedestrians.splice(d, 1);
        }
      }

      // Periodically spawn
      this.spawnTimer += dt;
      if (this.spawnTimer > 0.4 && this.pedestrians.length < MAX_PEDESTRIANS) {
        this.spawnTimer = 0;
        this.spawnPedestrianAround(city, focusX, focusY, VC.RNG);
      }

      // Gather active vehicles for threat checks
      var activeVehicles = [];
      if (trafficVehicles && trafficVehicles.length > 0) {
        for (var v = 0; v < trafficVehicles.length; v++) {
          activeVehicles.push(trafficVehicles[v].vehicle);
        }
      }

      // Update pedestrians
      for (var i = 0; i < this.pedestrians.length; i++) {
        this.pedestrians[i].update(dt, city, player, activeVehicles);
      }
    },

    getVisiblePedestrians: function(viewBounds) {
      var visible = [];
      for (var i = 0; i < this.pedestrians.length; i++) {
        var p = this.pedestrians[i];
        if (p.x >= viewBounds.left - 20 && p.x <= viewBounds.right + 20 &&
            p.y >= viewBounds.top - 20 && p.y <= viewBounds.bottom + 20) {
          visible.push(p);
        }
      }
      return visible;
    }
  };

  VC.pedestrians = PedestrianManager;
  VC.Pedestrians = PedestrianManager;
})();