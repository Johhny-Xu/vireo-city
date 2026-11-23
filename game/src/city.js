// Procedural city generator for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var BLOCK_SIZE = 260;
  var ROAD_WIDTH = 74;
  var SIDEWALK_WIDTH = 16;
  var STEP = BLOCK_SIZE + ROAD_WIDTH; // 334px
  var COLS = 7;
  var ROWS = 7;

  var NEON_NAMES = [
    { text: 'NEON COVE', color: '#00f0ff', glow: 'rgba(0,240,255,0.7)', sub: 'HOTEL & LOUNGE' },
    { text: 'SYNTH TAXI', color: '#ffaa00', glow: 'rgba(255,170,0,0.7)', sub: '24/7 CAB SERVICE' },
    { text: 'HYPERION', color: '#ff007f', glow: 'rgba(255,0,127,0.7)', sub: 'TOWER SUITES' },
    { text: 'VICE CASINO', color: '#39ff14', glow: 'rgba(57,255,20,0.7)', sub: 'SLOTS & CARDS' },
    { text: 'OCEANIC CLUB', color: '#00e5ff', glow: 'rgba(0,229,255,0.7)', sub: 'NIGHTCLUB' },
    { text: 'KOBRA DINER', color: '#ff3366', glow: 'rgba(255,51,102,0.7)', sub: 'OPEN ALL NIGHT' },
    { text: 'TURBO MOTORS', color: '#ffbb00', glow: 'rgba(255,187,0,0.7)', sub: 'EXOTIC CAR IMPORTS' },
    { text: 'AZURE PALMS', color: '#b347ff', glow: 'rgba(179,71,255,0.7)', sub: 'CONDOMINIUMS' },
    { text: 'HORIZON DECK', color: '#00f0ff', glow: 'rgba(0,240,255,0.7)', sub: 'ROOFTOP BAR' },
    { text: 'MIRAGE SPA', color: '#ff00aa', glow: 'rgba(255,0,170,0.7)', sub: 'WELLNESS' }
  ];

  function generateCity(seed) {
    var rng = new VC.Mulberry32(seed || 1986);

    var city = {
      seed: seed || 1986,
      cols: COLS,
      rows: ROWS,
      blockSize: BLOCK_SIZE,
      roadWidth: ROAD_WIDTH,
      sidewalkWidth: SIDEWALK_WIDTH,
      worldWidth: COLS * STEP + ROAD_WIDTH + 520, // includes eastern ocean strip & pier
      worldHeight: ROWS * STEP + ROAD_WIDTH,
      blocks: [],
      buildings: [],
      colliders: [],
      roads: [],
      intersections: [],
      sidewalks: [],
      streetlights: [],
      neonSigns: [],
      parkedCars: [],
      props: [],
      interactables: [],
      trees: [],
      tunnels: [
        { x: 740, y: 2 * STEP + ROAD_WIDTH - 54, w: 270, h: 54, name: 'VICE UNDERPASS' },
        { x: 4 * STEP + ROAD_WIDTH - 135, y: 4 * STEP + ROAD_WIDTH + 10, w: 54, h: 270, name: 'CANAL TUNNEL' }
      ],
      waterfront: null,
      pier: null,
      parkingLot: null,
      parks: []
    };

    var cityWidth = COLS * STEP + ROAD_WIDTH;
    var cityHeight = ROWS * STEP + ROAD_WIDTH;

    // Define Waterfront ocean along East edge
    city.waterfront = {
      x: cityWidth,
      y: 0,
      width: city.worldWidth - cityWidth,
      height: cityHeight,
      promenadeWidth: 40
    };

    // Pier jutting into the ocean from central block row 3
    city.pier = {
      x: cityWidth - 10,
      y: 3 * STEP + ROAD_WIDTH + 60,
      width: 440,
      height: 90
    };

    // 1. Generate Roads & Intersections
    // Horizontal roads
    for (var r = 0; r <= ROWS; r++) {
      var ry = r * STEP;
      city.roads.push({
        type: 'horizontal',
        x: 0,
        y: ry,
        w: cityWidth,
        h: ROAD_WIDTH,
        lanes: 2
      });
    }

    // Vertical roads
    for (var c = 0; c <= COLS; c++) {
      var rx = c * STEP;
      city.roads.push({
        type: 'vertical',
        x: rx,
        y: 0,
        w: ROAD_WIDTH,
        h: cityHeight,
        lanes: 2
      });
    }

    // Intersections with crosswalks & traffic lights
    for (var ir = 0; ir <= ROWS; ir++) {
      for (var ic = 0; ic <= COLS; ic++) {
        var ix = ic * STEP;
        var iy = ir * STEP;
        var inter = {
          x: ix,
          y: iy,
          w: ROAD_WIDTH,
          h: ROAD_WIDTH,
          crosswalks: [
            { x: ix, y: iy - 16, w: ROAD_WIDTH, h: 16, dir: 'h' },
            { x: ix, y: iy + ROAD_WIDTH, w: ROAD_WIDTH, h: 16, dir: 'h' },
            { x: ix - 16, y: iy, w: 16, h: ROAD_WIDTH, dir: 'v' },
            { x: ix + ROAD_WIDTH, y: iy, w: 16, h: ROAD_WIDTH, dir: 'v' }
          ],
          trafficLights: [
            { x: ix + 4, y: iy + 4, state: (ir + ic) % 2 === 0 ? 'green' : 'red' },
            { x: ix + ROAD_WIDTH - 4, y: iy + ROAD_WIDTH - 4, state: (ir + ic) % 2 === 0 ? 'green' : 'red' }
          ]
        };
        city.intersections.push(inter);
      }
    }

    // 2. Generate Blocks
    // Special designated blocks
    var park1Coord = { c: 2, r: 3 }; // Central Vireo Park
    var park2Coord = { c: 5, r: 1 }; // Oceanview Palm Park
    var parkingCoord = { c: 1, r: 5 }; // South Beach Parking Lot

    var neonIndex = 0;

    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        var bx = col * STEP + ROAD_WIDTH;
        var by = row * STEP + ROAD_WIDTH;
        var blockType = 'building';

        if (col === park1Coord.c && row === park1Coord.r) {
          blockType = 'park';
        } else if (col === park2Coord.c && row === park2Coord.r) {
          blockType = 'park';
        } else if (col === parkingCoord.c && row === parkingCoord.r) {
          blockType = 'parking';
        }

        var block = {
          col: col,
          row: row,
          x: bx,
          y: by,
          w: BLOCK_SIZE,
          h: BLOCK_SIZE,
          type: blockType,
          sidewalkRect: {
            x: bx - SIDEWALK_WIDTH,
            y: by - SIDEWALK_WIDTH,
            w: BLOCK_SIZE + SIDEWALK_WIDTH * 2,
            h: BLOCK_SIZE + SIDEWALK_WIDTH * 2
          }
        };

        city.blocks.push(block);
        city.sidewalks.push(block.sidewalkRect);

        // Add streetlights on the 4 corners/edges of every block sidewalk
        var lampDist = 75;
        // North sidewalk
        city.streetlights.push({ x: bx + lampDist, y: by - 8, dir: 'down' });
        city.streetlights.push({ x: bx + BLOCK_SIZE - lampDist, y: by - 8, dir: 'down' });
        // South sidewalk
        city.streetlights.push({ x: bx + lampDist, y: by + BLOCK_SIZE + 8, dir: 'up' });
        city.streetlights.push({ x: bx + BLOCK_SIZE - lampDist, y: by + BLOCK_SIZE + 8, dir: 'up' });
        // West sidewalk
        city.streetlights.push({ x: bx - 8, y: by + lampDist, dir: 'right' });
        city.streetlights.push({ x: bx - 8, y: by + BLOCK_SIZE - lampDist, dir: 'right' });
        // East sidewalk
        city.streetlights.push({ x: bx + BLOCK_SIZE + 8, y: by + lampDist, dir: 'left' });
        city.streetlights.push({ x: bx + BLOCK_SIZE + 8, y: by + BLOCK_SIZE - lampDist, dir: 'left' });

        if (blockType === 'park') {
          generatePark(city, block, rng);
        } else if (blockType === 'parking') {
          generateParkingLot(city, block, rng);
        } else {
          generateBuildingBlock(city, block, rng, neonIndex++);
        }
      }
    }

    // 3. Populate Pier props and lights
    generatePierDetails(city, rng);

    // 4. Populate Road Details & Parked Cars along Curbs
    generateRoadsideProps(city, rng);

    // 5. Publish deterministic sidewalk interactables for weapons and missions.
    // This is why weapon/mission coordinates should never be embedded in gameplay modules.
    // Sidewalk crates stay outside buildings and follow the same curb geometry as roadside props.
    var scatterBlock = city.blocks[12];
    city.interactables.push({
      type: 'weapon_box', id: 'scatter12',
      label: 'SCATTER 12 CRATE',
      x: scatterBlock.x + scatterBlock.w * 0.5,
      y: scatterBlock.y - SIDEWALK_WIDTH - 14,
      weapon: 'scatter12'
    });
    var sniperBlock = city.blocks[38];
    city.interactables.push({
      type: 'weapon_box', id: 'longshot',
      label: 'LONGSHOT CRATE',
      x: sniperBlock.x + sniperBlock.w * 0.5,
      y: sniperBlock.y + sniperBlock.h + SIDEWALK_WIDTH + 14,
      weapon: 'longshot'
    });
    city.interactables.push({
      type: 'mission', id: 'dock_contact', label: 'MIRA // DOCK CONTACT',
      x: 760, y: (1 * STEP + ROAD_WIDTH) - SIDEWALK_WIDTH - 14
    });

    // Add recognizable neon sign poles and curb furniture as deterministic street detail.
    for (var si = 0; si < city.blocks.length; si++) {
      var sb = city.blocks[si];
      if (sb.type !== 'building') continue;
      city.props.push({
        type: 'neon_pole',
        x: sb.x + 8,
        y: sb.y + sb.h - 8,
        color: si % 2 ? '#00f0ff' : '#ff007f'
      });
    }

    return city;
  }

  function generatePark(city, block, rng) {
    city.parks.push(block);

    // Park paths and central fountain / monument
    var cx = block.x + block.w / 2;
    var cy = block.y + block.h / 2;

    // Center plaza
    city.props.push({
      type: 'fountain',
      x: cx,
      y: cy,
      radius: 28,
      waterPulse: rng.randFloat(0, Math.PI * 2)
    });
    // Center monument blocks player
    city.colliders.push({
      x: cx - 24,
      y: cy - 24,
      w: 48,
      h: 48
    });

    // Park lamps
    city.streetlights.push({ x: cx - 55, y: cy - 55, dir: 'center' });
    city.streetlights.push({ x: cx + 55, y: cy - 55, dir: 'center' });
    city.streetlights.push({ x: cx - 55, y: cy + 55, dir: 'center' });
    city.streetlights.push({ x: cx + 55, y: cy + 55, dir: 'center' });

    // Benches along paths
    city.props.push({ type: 'bench', x: cx - 60, y: cy - 20, angle: 0 });
    city.props.push({ type: 'bench', x: cx + 60, y: cy - 20, angle: Math.PI });
    city.props.push({ type: 'bench', x: cx - 60, y: cy + 20, angle: 0 });
    city.props.push({ type: 'bench', x: cx + 60, y: cy + 20, angle: Math.PI });

    // Clusters of palm trees
    var treeOffsets = [
      { dx: 35, dy: 35 }, { dx: 80, dy: 35 }, { dx: 35, dy: 80 },
      { dx: -35, dy: 35 }, { dx: -80, dy: 35 }, { dx: -35, dy: 80 },
      { dx: 35, dy: -35 }, { dx: 80, dy: -35 }, { dx: 35, dy: -80 },
      { dx: -35, dy: -35 }, { dx: -80, dy: -35 }, { dx: -35, dy: -80 }
    ];

    for (var i = 0; i < treeOffsets.length; i++) {
      var tx = cx + treeOffsets[i].dx + rng.randFloat(-8, 8);
      var ty = cy + treeOffsets[i].dy + rng.randFloat(-8, 8);
      var tree = {
        type: 'palm',
        x: tx,
        y: ty,
        radius: rng.randFloat(22, 34),
        trunkRadius: 5,
        fronds: rng.randInt(5, 7),
        angleOffset: rng.randFloat(0, Math.PI * 2)
      };
      city.trees.push(tree);
      city.colliders.push({
        x: tx - 6,
        y: ty - 6,
        w: 12,
        h: 12
      });
    }
  }

  function generateParkingLot(city, block, rng) {
    city.parkingLot = block;

    // Stalls layout: 2 rows of parking bays
    var bayW = 28;
    var bayH = 50;
    var startX = block.x + 25;

    // Row 1 (North)
    for (var i = 0; i < 7; i++) {
      var px = startX + i * (bayW + 4);
      var py = block.y + 35;
      if (rng.randBool(0.65)) {
        var carColor = rng.randChoice(VC.PALETTE.carColors);
        var car = {
          x: px + bayW / 2,
          y: py + bayH / 2,
          w: 24,
          h: 46,
          angle: Math.PI / 2,
          color: carColor.body,
          roofColor: carColor.roof,
          glassColor: carColor.glass,
          lightsOn: rng.randBool(0.2)
        };
        city.parkedCars.push(car);
        city.colliders.push({ x: car.x - 12, y: car.y - 23, w: 24, h: 46 });
      }
    }

    // Row 2 (South)
    for (var j = 0; j < 7; j++) {
      var ppx = startX + j * (bayW + 4);
      var ppy = block.y + block.h - 85;
      if (rng.randBool(0.65)) {
        var cColor = rng.randChoice(VC.PALETTE.carColors);
        var pcar = {
          x: ppx + bayW / 2,
          y: ppy + bayH / 2,
          w: 24,
          h: 46,
          angle: -Math.PI / 2,
          color: cColor.body,
          roofColor: cColor.roof,
          glassColor: cColor.glass,
          lightsOn: rng.randBool(0.15)
        };
        city.parkedCars.push(pcar);
        city.colliders.push({ x: pcar.x - 12, y: pcar.y - 23, w: 24, h: 46 });
      }
    }

    // High floodlights
    city.streetlights.push({ x: block.x + 20, y: block.y + block.h / 2, dir: 'right', isFloodlight: true });
    city.streetlights.push({ x: block.x + block.w - 20, y: block.y + block.h / 2, dir: 'left', isFloodlight: true });

    // Dumpster in corner
    city.props.push({
      type: 'dumpster',
      x: block.x + block.w - 38,
      y: block.y + 18,
      w: 32,
      h: 20
    });
    city.colliders.push({ x: block.x + block.w - 38, y: block.y + 18, w: 32, h: 20 });
  }

  function generateBuildingBlock(city, block, rng, neonSeedIdx) {
    // Subdivide the block (260x260) into 1 to 4 building lots
    var pattern = rng.randChoice(['single_tower', 'split_v', 'split_h', 'quad_corner', 'l_shaped']);

    var lots = [];
    var pad = 4; // slight gap between buildings

    if (pattern === 'single_tower') {
      lots.push({ x: block.x + 10, y: block.y + 10, w: block.w - 20, h: block.h - 20, floors: rng.randInt(8, 16) });
    } else if (pattern === 'split_v') {
      var w1 = Math.floor((block.w - pad) / 2);
      lots.push({ x: block.x, y: block.y, w: w1, h: block.h, floors: rng.randInt(5, 12) });
      lots.push({ x: block.x + w1 + pad, y: block.y, w: block.w - w1 - pad, h: block.h, floors: rng.randInt(5, 12) });
    } else if (pattern === 'split_h') {
      var h1 = Math.floor((block.h - pad) / 2);
      lots.push({ x: block.x, y: block.y, w: block.w, h: h1, floors: rng.randInt(5, 12) });
      lots.push({ x: block.x, y: block.y + h1 + pad, w: block.w, h: block.h - h1 - pad, floors: rng.randInt(5, 12) });
    } else if (pattern === 'quad_corner') {
      var qw = Math.floor((block.w - pad) / 2);
      var qh = Math.floor((block.h - pad) / 2);
      lots.push({ x: block.x, y: block.y, w: qw, h: qh, floors: rng.randInt(4, 9) });
      lots.push({ x: block.x + qw + pad, y: block.y, w: qw, h: qh, floors: rng.randInt(4, 9) });
      lots.push({ x: block.x, y: block.y + qh + pad, w: qw, h: qh, floors: rng.randInt(4, 9) });
      lots.push({ x: block.x + qw + pad, y: block.y + qh + pad, w: qw, h: qh, floors: rng.randInt(4, 9) });
    } else { // l_shaped
      lots.push({ x: block.x, y: block.y, w: block.w - 60, h: 90, floors: rng.randInt(6, 12) });
      lots.push({ x: block.x, y: block.y + 90 + pad, w: 90, h: block.h - 90 - pad, floors: rng.randInt(5, 10) });
      lots.push({ x: block.x + 90 + pad, y: block.y + 90 + pad, w: block.w - 90 - pad, h: block.h - 90 - pad, floors: rng.randInt(3, 7) });
    }

    for (var i = 0; i < lots.length; i++) {
      var lot = lots[i];
      var bldg = createBuilding(lot.x, lot.y, lot.w, lot.h, lot.floors, rng, neonSeedIdx + i);
      city.buildings.push(bldg);
      city.colliders.push({ x: bldg.x, y: bldg.y, w: bldg.w, h: bldg.h });

      if (bldg.neonSign) {
        city.neonSigns.push(bldg.neonSign);
      }
    }
  }

  function createBuilding(x, y, w, h, floors, rng, neonSeed) {
    var roofColors = VC.PALETTE.roofBase;
    var roofColor = rng.randChoice(roofColors);
    var windowColorsAmber = VC.PALETTE.windowLitAmber;
    var windowColorsCyan = VC.PALETTE.windowLitCyan;
    var windowColorsMagenta = VC.PALETTE.windowLitMagenta;

    var style = rng.randChoice(['modern_glass', 'art_deco', 'brick_retro', 'concrete_brutal']);

    // Generate lit window matrix
    var windowCols = Math.max(3, Math.floor(w / 18));
    var windowRows = Math.max(2, Math.floor(h / 24));
    var windows = [];

    for (var r = 0; r < windowRows; r++) {
      for (var c = 0; c < windowCols; c++) {
        var isLit = rng.randBool(0.55);
        var winColor = VC.PALETTE.windowDark;
        var flickers = false;

        if (isLit) {
          var colorFamily = rng.randChoice(['amber', 'cyan', 'magenta']);
          if (colorFamily === 'amber') winColor = rng.randChoice(windowColorsAmber);
          else if (colorFamily === 'cyan') winColor = rng.randChoice(windowColorsCyan);
          else winColor = rng.randChoice(windowColorsMagenta);

          if (rng.randBool(0.08)) {
            flickers = true;
          }
        }

        windows.push({
          col: c,
          row: r,
          lit: isLit,
          color: winColor,
          flickers: flickers,
          flickerRate: rng.randFloat(3, 12)
        });
      }
    }

    // Rooftop props
    var roofProps = [];
    // AC condenser units
    var acCount = rng.randInt(1, Math.min(4, Math.floor((w * h) / 7000)));
    for (var a = 0; a < acCount; a++) {
      roofProps.push({
        type: 'ac_unit',
        x: x + 14 + rng.randFloat(0, Math.max(10, w - 40)),
        y: y + 14 + rng.randFloat(0, Math.max(10, h - 40)),
        w: 18,
        h: 14,
        fanAngle: rng.randFloat(0, Math.PI * 2),
        fanSpeed: rng.randFloat(4, 9)
      });
    }

    // Water tank on taller buildings
    if (floors >= 6 && rng.randBool(0.45) && w > 60 && h > 60) {
      roofProps.push({
        type: 'water_tank',
        x: x + w - 28,
        y: y + 20,
        radius: 12
      });
    }

    // Radio antenna beacon on top skyscrapers
    if (floors >= 10 && rng.randBool(0.6)) {
      roofProps.push({
        type: 'radio_beacon',
        x: x + w / 2,
        y: y + h / 2,
        height: 25,
        beaconColor: '#ff2244'
      });
    }

    // Rooftop neon billboard sign?
    var neonSign = null;
    if (floors >= 6 && rng.randBool(0.35) && w >= 90) {
      var neonData = NEON_NAMES[neonSeed % NEON_NAMES.length];
      neonSign = {
        x: x + w / 2,
        y: y + 8,
        w: Math.min(w - 16, 120),
        h: 22,
        text: neonData.text,
        subText: neonData.sub,
        color: neonData.color,
        glow: neonData.glow,
        buildingY: y + h
      };
    }

    return {
      x: x,
      y: y,
      w: w,
      h: h,
      floors: floors,
      roofColor: roofColor,
      style: style,
      windows: windows,
      windowCols: windowCols,
      windowRows: windowRows,
      roofProps: roofProps,
      neonSign: neonSign,
      shadowHeight: Math.min(50, floors * 3.5)
    };
  }

  function generatePierDetails(city, rng) {
    var pier = city.pier;
    if (!pier) return;

    // Pier deck colliders: the edges prevent falling off
    // North edge railing collider
    city.colliders.push({ x: pier.x, y: pier.y - 4, w: pier.width, h: 6 });
    // South edge railing collider
    city.colliders.push({ x: pier.x, y: pier.y + pier.height - 2, w: pier.width, h: 6 });
    // East edge end railing collider
    city.colliders.push({ x: pier.x + pier.width - 4, y: pier.y, w: 6, h: pier.height });

    // Lampposts on the pier
    for (var px = pier.x + 50; px < pier.x + pier.width - 30; px += 70) {
      city.streetlights.push({ x: px, y: pier.y + 6, dir: 'down', onPier: true });
      city.streetlights.push({ x: px, y: pier.y + pier.height - 6, dir: 'up', onPier: true });
    }

    // Benches on pier
    city.props.push({ type: 'bench', x: pier.x + 120, y: pier.y + pier.height / 2, angle: 0 });
    city.props.push({ type: 'bench', x: pier.x + 240, y: pier.y + pier.height / 2, angle: Math.PI });
    city.props.push({ type: 'bench', x: pier.x + 360, y: pier.y + pier.height / 2, angle: 0 });

    // Pier end neon sign
    city.neonSigns.push({
      x: pier.x + pier.width - 30,
      y: pier.y + pier.height / 2,
      w: 80,
      h: 24,
      text: 'OCEAN DECK',
      subText: 'FISHING PIER',
      color: '#00f0ff',
      glow: 'rgba(0,240,255,0.8)',
      buildingY: pier.y + pier.height
    });
  }

  function generateRoadsideProps(city, rng) {
    // Palm trees along coastal avenue (col 6 eastern road)
    var coastalX = COLS * STEP + ROAD_WIDTH / 2;
    for (var cy = 40; cy < city.worldHeight - 40; cy += 90) {
      var ptree = {
        type: 'palm',
        x: coastalX + 48,
        y: cy + rng.randFloat(-10, 10),
        radius: rng.randFloat(24, 32),
        trunkRadius: 6,
        fronds: 6,
        angleOffset: rng.randFloat(0, Math.PI * 2)
      };
      city.trees.push(ptree);
      city.colliders.push({ x: ptree.x - 6, y: ptree.y - 6, w: 12, h: 12 });
    }

    // Parked cars on street curbs
    for (var b = 0; b < city.blocks.length; b++) {
      var blk = city.blocks[b];
      if (blk.type === 'building') {
        // North curb
        if (rng.randBool(0.45)) {
          var carCol = rng.randChoice(VC.PALETTE.carColors);
          var carN = {
            x: blk.x + rng.randFloat(50, blk.w - 50),
            y: blk.y - SIDEWALK_WIDTH - 14,
            w: 44,
            h: 22,
            angle: 0,
            color: carCol.body,
            roofColor: carCol.roof,
            glassColor: carCol.glass,
            lightsOn: rng.randBool(0.1)
          };
          city.parkedCars.push(carN);
          city.colliders.push({ x: carN.x - 22, y: carN.y - 11, w: 44, h: 22 });
        }

        // South curb
        if (rng.randBool(0.45)) {
          var carCol2 = rng.randChoice(VC.PALETTE.carColors);
          var carS = {
            x: blk.x + rng.randFloat(50, blk.w - 50),
            y: blk.y + blk.h + SIDEWALK_WIDTH + 14,
            w: 44,
            h: 22,
            angle: Math.PI,
            color: carCol2.body,
            roofColor: carCol2.roof,
            glassColor: carCol2.glass,
            lightsOn: rng.randBool(0.1)
          };
          city.parkedCars.push(carS);
          city.colliders.push({ x: carS.x - 22, y: carS.y - 11, w: 44, h: 22 });
        }

        // Fire hydrants & trash bins on sidewalks
        if (rng.randBool(0.5)) {
          city.props.push({
            type: 'hydrant',
            x: blk.x + 24,
            y: blk.y - SIDEWALK_WIDTH / 2
          });
          city.colliders.push({ x: blk.x + 20, y: blk.y - SIDEWALK_WIDTH / 2 - 4, w: 8, h: 8 });
        }

        if (rng.randBool(0.5)) {
          city.props.push({
            type: 'trash_can',
            x: blk.x + blk.w - 24,
            y: blk.y - SIDEWALK_WIDTH / 2
          });
          city.colliders.push({ x: blk.x + blk.w - 28, y: blk.y - SIDEWALK_WIDTH / 2 - 4, w: 8, h: 8 });
        }
      }
    }
  }

  // Fast Circle-to-AABB collision check with boundary clamping
  function checkCollision(city, x, y, radius) {
    // World boundary check
    if (x - radius < 0) return { hit: true, nx: 1, ny: 0, depth: -(x - radius) };
    if (x + radius > city.worldWidth) return { hit: true, nx: -1, ny: 0, depth: (x + radius) - city.worldWidth };
    if (y - radius < 0) return { hit: true, nx: 0, ny: 1, depth: -(y - radius) };
    if (y + radius > city.worldHeight) return { hit: true, nx: 0, ny: -1, depth: (y + radius) - city.worldHeight };

    var colliders = city.colliders;
    for (var i = 0; i < colliders.length; i++) {
      var box = colliders[i];
      // Quick reject
      if (x + radius < box.x || x - radius > box.x + box.w ||
          y + radius < box.y || y - radius > box.y + box.h) {
        continue;
      }

      // Find closest point on AABB to circle center
      var closestX = Math.max(box.x, Math.min(x, box.x + box.w));
      var closestY = Math.max(box.y, Math.min(y, box.y + box.h));

      var distX = x - closestX;
      var distY = y - closestY;
      var distSq = distX * distX + distY * distY;

      if (distSq < radius * radius) {
        var dist = Math.sqrt(distSq);
        if (dist === 0) {
          // Circle center is inside box, push out toward nearest edge
          var dLeft = x - box.x;
          var dRight = (box.x + box.w) - x;
          var dTop = y - box.y;
          var dBottom = (box.y + box.h) - y;
          var minD = Math.min(dLeft, dRight, dTop, dBottom);
          if (minD === dLeft) return { hit: true, nx: -1, ny: 0, depth: radius + dLeft };
          if (minD === dRight) return { hit: true, nx: 1, ny: 0, depth: radius + dRight };
          if (minD === dTop) return { hit: true, nx: 0, ny: -1, depth: radius + dTop };
          return { hit: true, nx: 0, ny: 1, depth: radius + dBottom };
        } else {
          return {
            hit: true,
            nx: distX / dist,
            ny: distY / dist,
            depth: radius - dist
          };
        }
      }
    }

    return { hit: false };
  }

  VC.City = {
    generate: generateCity,
    checkCollision: checkCollision
  };
})();
