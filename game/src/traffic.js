// Civilian traffic simulation and vehicle AI for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var STEP = 334;
  var ROAD_WIDTH = 74;
  var HALF_ROAD = ROAD_WIDTH / 2; // 37
  var LANE_OFFSET = 18.5; // distance from road curb to lane center
  var STOP_DISTANCE = 32; // distance from stop line before crosswalk
  var MAX_TRAFFIC = 16;
  var SPAWN_RADIUS_MIN = 280;
  var SPAWN_RADIUS_MAX = 880;
  var DESPAWN_RADIUS = 1180;

  var TRAFFIC_CAR_TYPES = [
    { type: 'sable', weight: 30 },
    { type: 'cab', weight: 25 },
    { type: 'kestrel', weight: 15 },
    { type: 'hauler', weight: 12 },
    { type: 'ranger', weight: 10 },
    { type: 'ronin', weight: 6 },
    { type: 'interceptor', weight: 2 }
  ];

  function pickRandomType(rng) {
    var roll = (rng ? rng.randFloat(0, 100) : Math.random() * 100);
    var acc = 0;
    for (var i = 0; i < TRAFFIC_CAR_TYPES.length; i++) {
      acc += TRAFFIC_CAR_TYPES[i].weight;
      if (roll <= acc) return TRAFFIC_CAR_TYPES[i].type;
    }
    return 'sable';
  }

  function getTrafficLightState(ic, ir, gameTime) {
    // 14-second total cycle: 5.5s green, 1.5s amber, 5.5s red, 1.5s amber
    var phase = ((gameTime || 0) + (ic + ir) * 3.5) % 14.0;
    if (phase < 5.5) {
      return { horiz: 'green', vert: 'red' };
    } else if (phase < 7.0) {
      return { horiz: 'amber', vert: 'red' };
    } else if (phase < 12.5) {
      return { horiz: 'red', vert: 'green' };
    } else {
      return { horiz: 'red', vert: 'amber' };
    }
  }

  function TrafficCar(typeKey, x, y, heading, roadAxis, laneDir, laneIndex) {
    this.vehicle = new VC.Vehicle(typeKey, x, y, heading);
    this.roadAxis = roadAxis; // 'h' or 'v'
    this.laneDir = laneDir;   // 1 or -1
    this.laneIndex = laneIndex; // road row or col index
    this.targetSpeed = 135 + Math.random() * 55;
    this.waitTimer = 0;
    this.turning = false;
    this.turnTarget = null;
    this.honkCooldown = 0;
  }

  var TrafficManager = {
    vehicles: [],
    spawnTimer: 0,

    init: function() {
      this.vehicles = [];
      this.spawnTimer = 0;
    },

    clear: function() {
      this.vehicles = [];
    },

    initDeterministic: function(city, player) {
      this.vehicles = [];
      if (!city) return;

      var rng = VC.RNG || new VC.Mulberry32(1986);
      var px = player ? player.x : 740;
      var py = player ? player.y : 705;

      // Spawn 6 deterministic vehicles along nearby roads
      var initialPlacements = [
        { type: 'cab', axis: 'h', dir: 1, idx: 2, offset: 180, speed: 140 },
        { type: 'sable', axis: 'h', dir: -1, idx: 2, offset: -220, speed: 130 },
        { type: 'kestrel', axis: 'v', dir: 1, idx: 2, offset: 260, speed: 160 },
        { type: 'hauler', axis: 'v', dir: -1, idx: 2, offset: -190, speed: 110 },
        { type: 'ronin', axis: 'h', dir: 1, idx: 1, offset: 120, speed: 175 },
        { type: 'interceptor', axis: 'v', dir: 1, idx: 3, offset: 150, speed: 150 }
      ];

      for (var i = 0; i < initialPlacements.length; i++) {
        var p = initialPlacements[i];
        var x = 0;
        var y = 0;
        var heading = 0;

        if (p.axis === 'h') {
          var ry = p.idx * STEP;
          y = p.dir === 1 ? (ry + ROAD_WIDTH - LANE_OFFSET) : (ry + LANE_OFFSET);
          x = px + p.offset;
          heading = p.dir === 1 ? 0 : Math.PI;
        } else {
          var rx = p.idx * STEP;
          x = p.dir === 1 ? (rx + LANE_OFFSET) : (rx + ROAD_WIDTH - LANE_OFFSET);
          y = py + p.offset;
          heading = p.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        }

        var tc = new TrafficCar(p.type, x, y, heading, p.axis, p.dir, p.idx);
        tc.vehicle.speed = p.speed;
        tc.vehicle.vx = Math.cos(heading) * p.speed;
        tc.vehicle.vy = Math.sin(heading) * p.speed;
        this.vehicles.push(tc);
      }
    },

    spawnVehicleAround: function(city, focusX, focusY, rng) {
      if (this.vehicles.length >= MAX_TRAFFIC || !city) return;

      var rand = rng || VC.RNG || new VC.Mulberry32(Math.floor(Math.random() * 100000));
      var isHoriz = rand.randBool(0.5);
      var type = pickRandomType(rand);

      if (isHoriz) {
        // Pick a horizontal road row within vertical distance of focus
        var rowCandidates = [];
        for (var r = 0; r <= city.rows; r++) {
          var ry = r * STEP;
          if (Math.abs(ry + HALF_ROAD - focusY) < SPAWN_RADIUS_MAX) {
            rowCandidates.push(r);
          }
        }
        if (rowCandidates.length === 0) return;
        var row = rand.randChoice(rowCandidates);
        var dir = rand.randChoice([1, -1]); // 1 = East, -1 = West
        var yPos = dir === 1 ? (row * STEP + ROAD_WIDTH - LANE_OFFSET) : (row * STEP + LANE_OFFSET);

        // Spawn to left or right of focus
        var side = rand.randChoice([1, -1]);
        var dist = rand.randFloat(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);
        var xPos = focusX + side * dist;

        // Keep inside city bounds
        var cityMaxX = city.cols * STEP + ROAD_WIDTH;
        if (xPos < 60 || xPos > cityMaxX - 60) return;

        // Check clearance with existing vehicles
        for (var i = 0; i < this.vehicles.length; i++) {
          var other = this.vehicles[i].vehicle;
          if (Math.hypot(other.x - xPos, other.y - yPos) < 90) return;
        }

        var heading = dir === 1 ? 0 : Math.PI;
        var carH = new TrafficCar(type, xPos, yPos, heading, 'h', dir, row);
        carH.vehicle.speed = 120 + rand.randFloat(0, 50);
        this.vehicles.push(carH);
      } else {
        // Vertical road column
        var colCandidates = [];
        for (var c = 0; c <= city.cols; c++) {
          var rx = c * STEP;
          if (Math.abs(rx + HALF_ROAD - focusX) < SPAWN_RADIUS_MAX) {
            colCandidates.push(c);
          }
        }
        if (colCandidates.length === 0) return;
        var col = rand.randChoice(colCandidates);
        var vdir = rand.randChoice([1, -1]); // 1 = South, -1 = North
        var xPosV = vdir === 1 ? (col * STEP + LANE_OFFSET) : (col * STEP + ROAD_WIDTH - LANE_OFFSET);

        var sideV = rand.randChoice([1, -1]);
        var distV = rand.randFloat(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);
        var yPosV = focusY + sideV * distV;

        var cityMaxY = city.rows * STEP + ROAD_WIDTH;
        if (yPosV < 60 || yPosV > cityMaxY - 60) return;

        for (var j = 0; j < this.vehicles.length; j++) {
          var oth = this.vehicles[j].vehicle;
          if (Math.hypot(oth.x - xPosV, oth.y - yPosV) < 90) return;
        }

        var headingV = vdir === 1 ? Math.PI / 2 : -Math.PI / 2;
        var carV = new TrafficCar(type, xPosV, yPosV, headingV, 'v', vdir, col);
        carV.vehicle.speed = 120 + rand.randFloat(0, 50);
        this.vehicles.push(carV);
      }
    },

    update: function(dt, city, player, gameTime) {
      if (!city) return;

      var focusX = player ? player.x : 740;
      var focusY = player ? player.y : 705;

      // Despawn vehicles too far from player
      for (var d = this.vehicles.length - 1; d >= 0; d--) {
        var v = this.vehicles[d].vehicle;
        var distToPlayer = Math.hypot(v.x - focusX, v.y - focusY);
        if (distToPlayer > DESPAWN_RADIUS) {
          this.vehicles.splice(d, 1);
        }
      }

      // Periodically spawn new traffic vehicles
      this.spawnTimer += dt;
      if (this.spawnTimer > 0.45 && this.vehicles.length < MAX_TRAFFIC) {
        this.spawnTimer = 0;
        this.spawnVehicleAround(city, focusX, focusY, VC.RNG);
      }

      // Update AI for each traffic vehicle
      for (var i = 0; i < this.vehicles.length; i++) {
        var tc = this.vehicles[i];
        this.updateCarAI(tc, dt, city, player, gameTime, i);
      }
    },

    updateCarAI: function(tc, dt, city, player, gameTime, carIndex) {
      var veh = tc.vehicle;
      if (veh.driver) return; // Driven by player, do not apply AI

      var targetSpeed = tc.targetSpeed;
      var throttle = 0;
      var steer = 0;
      var brake = false;

      // 1. Maintain Lane Alignment
      var laneCenter = 0;
      var currentOffset = 0;
      if (tc.roadAxis === 'h') {
        var ry = tc.laneIndex * STEP;
        laneCenter = tc.laneDir === 1 ? (ry + ROAD_WIDTH - LANE_OFFSET) : (ry + LANE_OFFSET);
        currentOffset = veh.y - laneCenter;
        // Target heading is 0 (East) or PI (West)
        var desiredHeadingH = tc.laneDir === 1 ? 0 : Math.PI;
        // Mild steer correction toward lane center
        var headingCorrectionH = (tc.laneDir === 1 ? -currentOffset : currentOffset) * 0.04;
        var diffH = desiredHeadingH - veh.heading;
        while (diffH < -Math.PI) diffH += Math.PI * 2;
        while (diffH > Math.PI) diffH -= Math.PI * 2;
        steer = Math.max(-0.6, Math.min(0.6, diffH * 1.5 + headingCorrectionH));
      } else {
        var rx = tc.laneIndex * STEP;
        laneCenter = tc.laneDir === 1 ? (rx + LANE_OFFSET) : (rx + ROAD_WIDTH - LANE_OFFSET);
        currentOffset = veh.x - laneCenter;
        // Target heading is PI/2 (South) or -PI/2 (North)
        var desiredHeadingV = tc.laneDir === 1 ? Math.PI / 2 : -Math.PI / 2;
        var headingCorrectionV = (tc.laneDir === 1 ? currentOffset : -currentOffset) * 0.04;
        var diffV = desiredHeadingV - veh.heading;
        while (diffV < -Math.PI) diffV += Math.PI * 2;
        while (diffV > Math.PI) diffV -= Math.PI * 2;
        steer = Math.max(-0.6, Math.min(0.6, diffV * 1.5 + headingCorrectionV));
      }

      // 2. Traffic Light Sensing
      var shouldStopForLight = false;
      var nextIntersection = this.getNextIntersection(veh, tc.roadAxis, tc.laneDir, city);
      if (nextIntersection) {
        var lightState = getTrafficLightState(nextIntersection.col, nextIntersection.row, gameTime);
        var activeLight = tc.roadAxis === 'h' ? lightState.horiz : lightState.vert;

        if (activeLight === 'red' || activeLight === 'amber') {
          var distToStopLine = this.getDistanceToStopLine(veh, nextIntersection, tc.roadAxis, tc.laneDir);
          if (distToStopLine > 0 && distToStopLine < 85) {
            shouldStopForLight = true;
          }
        }
      }

      // 3. Obstacle Ahead Detection (Cars in same lane, player vehicle, player on foot)
      var obstacleAhead = this.checkObstacleAhead(tc, carIndex, player);

      // 4. Decision: Throttle vs Brake
      if (shouldStopForLight || obstacleAhead.stop) {
        targetSpeed = 0;
        brake = true;
        throttle = -0.5;
      } else if (obstacleAhead.slow) {
        targetSpeed = Math.min(targetSpeed, obstacleAhead.leadSpeed || 60);
        if (veh.speed > targetSpeed) {
          brake = true;
        } else {
          throttle = 0.4;
        }
      } else {
        if (veh.speed < targetSpeed) {
          throttle = 0.85;
        } else {
          throttle = 0.1;
        }
      }

      // Apply controls to vehicle model
      veh.applyControl(throttle, steer, brake, false, dt);
      veh.update(dt, city);

      // 5. Intersections Passing & Optional Turning
      if (nextIntersection) {
        this.handleIntersectionNavigation(tc, nextIntersection, city);
      }
    },

    getNextIntersection: function(veh, axis, dir, city) {
      if (axis === 'h') {
        var currentCol = Math.floor(veh.x / STEP);
        var targetCol = dir === 1 ? currentCol + 1 : currentCol;
        var row = Math.floor((veh.y + HALF_ROAD) / STEP);
        if (targetCol >= 0 && targetCol <= city.cols && row >= 0 && row <= city.rows) {
          return {
            col: targetCol,
            row: row,
            x: targetCol * STEP,
            y: row * STEP
          };
        }
      } else {
        var currentRow = Math.floor(veh.y / STEP);
        var targetRow = dir === 1 ? currentRow + 1 : currentRow;
        var col = Math.floor((veh.x + HALF_ROAD) / STEP);
        if (targetRow >= 0 && targetRow <= city.rows && col >= 0 && col <= city.cols) {
          return {
            col: col,
            row: targetRow,
            x: col * STEP,
            y: targetRow * STEP
          };
        }
      }
      return null;
    },

    getDistanceToStopLine: function(veh, inter, axis, dir) {
      if (axis === 'h') {
        if (dir === 1) {
          return inter.x - veh.x;
        } else {
          return veh.x - (inter.x + ROAD_WIDTH);
        }
      } else {
        if (dir === 1) {
          return inter.y - veh.y;
        } else {
          return veh.y - (inter.y + ROAD_WIDTH);
        }
      }
    },

    handleIntersectionNavigation: function(tc, inter, city) {
      var veh = tc.vehicle;
      var inIntersection = (
        veh.x >= inter.x && veh.x <= inter.x + ROAD_WIDTH &&
        veh.y >= inter.y && veh.y <= inter.y + ROAD_WIDTH
      );

      if (inIntersection && !tc.turning) {
        // Approaching intersection center: chance to turn
        var cx = inter.x + HALF_ROAD;
        var cy = inter.y + HALF_ROAD;
        var distToCenter = Math.hypot(veh.x - cx, veh.y - cy);

        if (distToCenter < 18) {
          var rng = VC.RNG || new VC.Mulberry32(Math.floor(veh.x + veh.y));
          var roll = rng.randFloat(0, 1);
          // 25% chance to turn into intersecting street
          if (roll < 0.25) {
            tc.turning = true;
            if (tc.roadAxis === 'h') {
              // Turn vertical
              var newDirV = rng.randBool(0.5) ? 1 : -1;
              tc.roadAxis = 'v';
              tc.laneDir = newDirV;
              tc.laneIndex = inter.col;
              veh.heading = newDirV === 1 ? Math.PI / 2 : -Math.PI / 2;
            } else {
              // Turn horizontal
              var newDirH = rng.randBool(0.5) ? 1 : -1;
              // Don't turn East past waterfront
              if (newDirH === 1 && inter.col >= city.cols) newDirH = -1;
              tc.roadAxis = 'h';
              tc.laneDir = newDirH;
              tc.laneIndex = inter.row;
              veh.heading = newDirH === 1 ? 0 : Math.PI;
            }
          }
        }
      } else if (!inIntersection && tc.turning) {
        tc.turning = false;
      }
    },

    checkObstacleAhead: function(tc, selfIdx, player) {
      var veh = tc.vehicle;
      var forwardX = Math.cos(veh.heading);
      var forwardY = Math.sin(veh.heading);

      var res = { stop: false, slow: false, leadSpeed: null };

      // 1. Check player on foot
      if (player && !player.vehicle) {
        var pdx = player.x - veh.x;
        var pdy = player.y - veh.y;
        var pDist = Math.hypot(pdx, pdy);
        if (pDist < 95) {
          var pForward = pdx * forwardX + pdy * forwardY;
          var pLateral = Math.abs(-forwardY * pdx + forwardX * pdy);
          if (pForward > 0 && pForward < 85 && pLateral < 22) {
            res.stop = true;
            return res;
          }
        }
      }

      // 2. Check player's vehicle (if driving)
      if (player && player.vehicle && player.vehicle !== veh) {
        var pv = player.vehicle;
        var vdx = pv.x - veh.x;
        var vdy = pv.y - veh.y;
        var vDist = Math.hypot(vdx, vdy);
        if (vDist < 120) {
          var vForward = vdx * forwardX + vdy * forwardY;
          var vLateral = Math.abs(-forwardY * vdx + forwardX * vdy);
          if (vForward > 0 && vForward < 95 && vLateral < 26) {
            if (vDist < 50) {
              res.stop = true;
            } else {
              res.slow = true;
              res.leadSpeed = Math.abs(pv.speed);
            }
            return res;
          }
        }
      }

      // 3. Check other traffic vehicles ahead
      for (var j = 0; j < this.vehicles.length; j++) {
        if (j === selfIdx) continue;
        var other = this.vehicles[j].vehicle;
        var odx = other.x - veh.x;
        var ody = other.y - veh.y;
        var oDist = Math.hypot(odx, ody);

        if (oDist < 110) {
          var oForward = odx * forwardX + ody * forwardY;
          var oLateral = Math.abs(-forwardY * odx + forwardX * ody);
          if (oForward > 0 && oForward < 90 && oLateral < 24) {
            if (oDist < 52) {
              res.stop = true;
            } else {
              res.slow = true;
              res.leadSpeed = Math.abs(other.speed);
            }
            return res;
          }
        }
      }

      return res;
    },

    getVisibleVehicles: function(viewBounds) {
      var visible = [];
      for (var i = 0; i < this.vehicles.length; i++) {
        var v = this.vehicles[i].vehicle;
        if (v.x >= viewBounds.left - 60 && v.x <= viewBounds.right + 60 &&
            v.y >= viewBounds.top - 60 && v.y <= viewBounds.bottom + 60) {
          visible.push(v);
        }
      }
      return visible;
    }
  };

  VC.traffic = TrafficManager;
  VC.Traffic = TrafficManager;
  VC.getTrafficLightState = getTrafficLightState;
})();