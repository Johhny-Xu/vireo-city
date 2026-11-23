// Comprehensive multi-pass renderer for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var Renderer = {
    render: function(ctx, city, player, camera, timeSec) {
      if (!city || !camera) return;

      var view = camera.getVisibleBounds(120);

      // Clear logical screen
      ctx.fillStyle = VC.PALETTE.skyVoid;
      ctx.fillRect(0, 0, 1280, 800);

      // Begin Camera World Space
      camera.applyTransform(ctx);

      // 1. Water & Ocean Surface
      this.renderOceanAndWaterfront(ctx, city, view, timeSec);

      // 2. Ground: Roads, Sidewalks, Parks, Parking lot
      this.renderGroundSurfaces(ctx, city, view, timeSec);

      // 3. Wet Asphalt Neon & Light Reflections (Smeared vertical streaks on slick pavement)
      this.renderWetAsphaltReflections(ctx, city, view, timeSec);

      // 4. Ground Shadows (Buildings, Cars, Trees)
      this.renderGroundShadows(ctx, city, view);

      // 5. Buildings, Windows & Rooftops
      this.renderBuildings(ctx, city, view, timeSec);

      // 6. Y-Sorted Entities & Street Props (Vehicles, Trees, Props, Player)
      this.renderYSortedEntities(ctx, city, player, view, timeSec);

      // 7. Lighting Overlay (Sodium streetlights, car headlights, neon halos)
      this.renderLightingOverlay(ctx, city, view, timeSec);

      // End Camera World Space
      camera.restoreTransform(ctx);

      // 8. Screen-Space Atmosphere: Rain mist, Teal Haze, Vignette
      this.renderScreenAtmosphere(ctx, timeSec);
    },

    renderOceanAndWaterfront: function(ctx, city, view, timeSec) {
      var wf = city.waterfront;
      if (!wf) return;
      if (wf.x + wf.width < view.left || wf.x > view.right) return;

      // Deep Ocean Abyss
      var oceanGrad = ctx.createLinearGradient(wf.x, 0, city.worldWidth, 0);
      oceanGrad.addColorStop(0, VC.PALETTE.oceanMid);
      oceanGrad.addColorStop(1, VC.PALETTE.oceanDeep);
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(wf.x, 0, wf.width, city.worldHeight);

      // Animated ocean swells & waves
      ctx.strokeStyle = 'rgba(30, 90, 130, 0.25)';
      ctx.lineWidth = 2;
      var waveT = (timeSec || 0) * 1.5;
      for (var wy = 20; wy < city.worldHeight; wy += 45) {
        var waveOffset = Math.sin(wy * 0.05 + waveT) * 14;
        ctx.beginPath();
        ctx.moveTo(wf.x + 20 + waveOffset, wy);
        ctx.lineTo(city.worldWidth, wy);
        ctx.stroke();
      }

      // Shoreline foam edge
      ctx.strokeStyle = VC.PALETTE.oceanFoam;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (var sy = 0; sy <= city.worldHeight; sy += 30) {
        var foamX = wf.x + Math.sin(sy * 0.08 + waveT * 2) * 5;
        if (sy === 0) ctx.moveTo(foamX, sy);
        else ctx.lineTo(foamX, sy);
      }
      ctx.stroke();

      // Pier Wooden Deck
      var pier = city.pier;
      if (pier) {
        // Pier drop shadow on water
        ctx.fillStyle = 'rgba(1, 3, 6, 0.7)';
        ctx.fillRect(pier.x, pier.y + pier.height, pier.width, 16);

        // Wooden deck base
        ctx.fillStyle = VC.PALETTE.pierPlankBase;
        ctx.fillRect(pier.x, pier.y, pier.width, pier.height);

        // Individual plank lines
        ctx.strokeStyle = VC.PALETTE.pierPlankDark;
        ctx.lineWidth = 1.5;
        for (var px = pier.x; px < pier.x + pier.width; px += 10) {
          ctx.beginPath();
          ctx.moveTo(px, pier.y);
          ctx.lineTo(px, pier.y + pier.height);
          ctx.stroke();
        }

        // Pier perimeter railings
        ctx.strokeStyle = VC.PALETTE.pierPost;
        ctx.lineWidth = 3;
        ctx.strokeRect(pier.x, pier.y, pier.width, pier.height);
      }
    },

    renderGroundSurfaces: function(ctx, city, view, timeSec) {
      // 1. Sidewalk bases under blocks
      ctx.fillStyle = VC.PALETTE.sidewalkBase;
      for (var s = 0; s < city.sidewalks.length; s++) {
        var sw = city.sidewalks[s];
        if (sw.x + sw.w < view.left || sw.x > view.right ||
            sw.y + sw.h < view.top || sw.y > view.bottom) continue;

        ctx.fillRect(sw.x, sw.y, sw.w, sw.h);

        // Curb highlight edge
        ctx.strokeStyle = VC.PALETTE.curbHighlight;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sw.x, sw.y, sw.w, sw.h);
      }

      // 2. Asphalt Road surfaces
      ctx.fillStyle = VC.PALETTE.asphaltBase;
      for (var r = 0; r < city.roads.length; r++) {
        var rd = city.roads[r];
        if (rd.x + rd.w < view.left || rd.x > view.right ||
            rd.y + rd.h < view.top || rd.y > view.bottom) continue;

        ctx.fillRect(rd.x, rd.y, rd.w, rd.h);

        // Road lane markings
        if (rd.type === 'horizontal') {
          // Yellow dashed centerline
          ctx.strokeStyle = VC.PALETTE.roadYellow;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([18, 14]);
          ctx.beginPath();
          ctx.moveTo(rd.x, rd.y + rd.h / 2);
          ctx.lineTo(rd.x + rd.w, rd.y + rd.h / 2);
          ctx.stroke();
          ctx.setLineDash([]);

          // White edge lines
          ctx.strokeStyle = VC.PALETTE.roadWhite;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rd.x, rd.y + 3);
          ctx.lineTo(rd.x + rd.w, rd.y + 3);
          ctx.moveTo(rd.x, rd.y + rd.h - 3);
          ctx.lineTo(rd.x + rd.w, rd.y + rd.h - 3);
          ctx.stroke();
        } else {
          // Vertical road centerline
          ctx.strokeStyle = VC.PALETTE.roadYellow;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([18, 14]);
          ctx.beginPath();
          ctx.moveTo(rd.x + rd.w / 2, rd.y);
          ctx.lineTo(rd.x + rd.w / 2, rd.y + rd.h);
          ctx.stroke();
          ctx.setLineDash([]);

          // White edge lines
          ctx.strokeStyle = VC.PALETTE.roadWhite;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rd.x + 3, rd.y);
          ctx.lineTo(rd.x + 3, rd.y + rd.h);
          ctx.moveTo(rd.x + rd.w - 3, rd.y);
          ctx.lineTo(rd.x + rd.w - 3, rd.y + rd.h);
          ctx.stroke();
        }
      }

      // 3. Intersections: Crosswalk zebra stripes & stop lines
      ctx.fillStyle = VC.PALETTE.crosswalkWhite;
      for (var i = 0; i < city.intersections.length; i++) {
        var inter = city.intersections[i];
        if (inter.x + inter.w < view.left || inter.x > view.right ||
            inter.y + inter.h < view.top || inter.y > view.bottom) continue;

        for (var k = 0; k < inter.crosswalks.length; k++) {
          var cw = inter.crosswalks[k];
          if (cw.dir === 'h') {
            for (var cx = cw.x + 4; cx < cw.x + cw.w - 8; cx += 12) {
              ctx.fillRect(cx, cw.y + 2, 7, cw.h - 4);
            }
          } else {
            for (var cy = cw.y + 4; cy < cw.y + cw.h - 8; cy += 12) {
              ctx.fillRect(cw.x + 2, cy, cw.w - 4, 7);
            }
          }
        }
      }

      // 4. Parks: Dark lush lawn & paths
      for (var p = 0; p < city.parks.length; p++) {
        var park = city.parks[p];
        if (park.x + park.w < view.left || park.x > view.right ||
            park.y + park.h < view.top || park.y > view.bottom) continue;

        // Dark grass
        ctx.fillStyle = VC.PALETTE.grassBase;
        ctx.fillRect(park.x, park.y, park.w, park.h);

        // Diagonal stone walkways
        ctx.strokeStyle = '#223028';
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(park.x, park.y);
        ctx.lineTo(park.x + park.w, park.y + park.h);
        ctx.moveTo(park.x + park.w, park.y);
        ctx.lineTo(park.x, park.y + park.h);
        ctx.stroke();
      }

      // 5. Parking lot asphalt & stall markings
      var pLot = city.parkingLot;
      if (pLot && !(pLot.x + pLot.w < view.left || pLot.x > view.right ||
                    pLot.y + pLot.h < view.top || pLot.y > view.bottom)) {
        ctx.fillStyle = '#0f141d';
        ctx.fillRect(pLot.x, pLot.y, pLot.w, pLot.h);

        // Parking stall painted lines
        ctx.strokeStyle = 'rgba(230, 240, 255, 0.6)';
        ctx.lineWidth = 2;
        var bayW = 28;
        var startX = pLot.x + 25;
        for (var b = 0; b <= 7; b++) {
          var lx = startX + b * (bayW + 4);
          // Row 1
          ctx.strokeRect(lx, pLot.y + 35, bayW, 50);
          // Row 2
          ctx.strokeRect(lx, pLot.y + pLot.h - 85, bayW, 50);
        }
      }
    },

    renderWetAsphaltReflections: function(ctx, city, view, timeSec) {
      // Art Direction: "wet asphalt reflects neon as vertical smeared streaks"
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      var signs = city.neonSigns;
      for (var i = 0; i < signs.length; i++) {
        var sign = signs[i];
        if (sign.x + sign.w < view.left || sign.x - sign.w > view.right ||
            sign.y < view.top - 200 || sign.y > view.bottom + 200) continue;

        // Smeared vertical reflection on asphalt
        var reflY = sign.buildingY || (sign.y + 40);
        var reflH = 110;
        var reflW = sign.w * 0.9;

        var reflGrad = ctx.createLinearGradient(0, reflY, 0, reflY + reflH);
        reflGrad.addColorStop(0, sign.color);
        reflGrad.addColorStop(0.3, sign.color);
        reflGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = reflGrad;
        ctx.globalAlpha = 0.32;
        ctx.fillRect(sign.x - reflW / 2, reflY, reflW, reflH);
      }

      // Streetlights reflection streaks
      var lights = city.streetlights;
      for (var j = 0; j < lights.length; j++) {
        var lit = lights[j];
        if (lit.x < view.left || lit.x > view.right ||
            lit.y < view.top - 80 || lit.y > view.bottom + 80) continue;

        var lGrad = ctx.createLinearGradient(0, lit.y, 0, lit.y + 60);
        lGrad.addColorStop(0, VC.PALETTE.sodiumMid);
        lGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = lGrad;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(lit.x - 8, lit.y, 16, 60);
      }

      ctx.restore();
    },

    renderGroundShadows: function(ctx, city, view) {
      ctx.save();
      ctx.fillStyle = VC.PALETTE.shadowSoft;

      // Building directional drop shadows (cast south-east)
      var buildings = city.buildings;
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        if (b.x + b.w + 50 < view.left || b.x > view.right ||
            b.y + b.h + 50 < view.top || b.y > view.bottom) continue;

        var sh = b.shadowHeight || 30;
        ctx.beginPath();
        ctx.moveTo(b.x + b.w, b.y);
        ctx.lineTo(b.x + b.w + sh * 0.6, b.y + sh * 0.6);
        ctx.lineTo(b.x + b.w + sh * 0.6, b.y + b.h + sh);
        ctx.lineTo(b.x + sh * 0.6, b.y + b.h + sh);
        ctx.lineTo(b.x, b.y + b.h);
        ctx.lineTo(b.x + b.w, b.y + b.h);
        ctx.closePath();
        ctx.fill();
      }

      // Parked car drop shadows
      var cars = city.parkedCars;
      for (var c = 0; c < cars.length; c++) {
        var car = cars[c];
        if (car.x < view.left - 40 || car.x > view.right + 40 ||
            car.y < view.top - 40 || car.y > view.bottom + 40) continue;

        ctx.beginPath();
        ctx.ellipse(car.x + 4, car.y + 6, car.w / 2 + 4, car.h / 2 + 3, car.angle, 0, Math.PI * 2);
        ctx.fill();
      }

      // Tree circular shadows
      var trees = city.trees;
      for (var t = 0; t < trees.length; t++) {
        var tr = trees[t];
        if (tr.x < view.left - 50 || tr.x > view.right + 50 ||
            tr.y < view.top - 50 || tr.y > view.bottom + 50) continue;

        ctx.beginPath();
        ctx.arc(tr.x + 6, tr.y + 10, tr.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    renderBuildings: function(ctx, city, view, timeSec) {
      var buildings = city.buildings;
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        if (b.x + b.w < view.left || b.x > view.right ||
            b.y + b.h < view.top || b.y > view.bottom) continue;

        // Building main rooftop surface
        ctx.fillStyle = b.roofColor;
        ctx.fillRect(b.x, b.y, b.w, b.h);

        // Outer parapet wall rim
        ctx.strokeStyle = VC.PALETTE.roofParapet;
        ctx.lineWidth = 4;
        ctx.strokeRect(b.x, b.y, b.w, b.h);

        // Windows along roof perimeter or skylights
        var wins = b.windows;
        var winCols = b.windowCols;
        var winRows = b.windowRows;
        var cellW = b.w / winCols;
        var cellH = b.h / winRows;

        for (var w = 0; w < wins.length; w++) {
          var win = wins[w];
          var wx = b.x + win.col * cellW + 3;
          var wy = b.y + win.row * cellH + 3;
          var ww = cellW - 6;
          var wh = cellH - 6;

          if (win.lit) {
            var winAlpha = 0.85;
            if (win.flickers) {
              var flickerVal = Math.sin((timeSec || 0) * win.flickerRate);
              winAlpha = flickerVal > 0.2 ? 0.9 : 0.25;
            }
            ctx.save();
            ctx.globalAlpha = winAlpha;
            ctx.fillStyle = win.color;
            ctx.fillRect(wx, wy, ww, wh);
            ctx.restore();
          } else {
            ctx.fillStyle = VC.PALETTE.windowDark;
            ctx.fillRect(wx, wy, ww, wh);
          }
        }

        // Rooftop Props: AC Units, Water Tanks, Radio Beacons
        for (var p = 0; p < b.roofProps.length; p++) {
          var prop = b.roofProps[p];
          if (prop.type === 'ac_unit') {
            ctx.fillStyle = '#2b3445';
            ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
            ctx.strokeStyle = '#1a202c';
            ctx.lineWidth = 1;
            ctx.strokeRect(prop.x, prop.y, prop.w, prop.h);

            // Fan circle
            ctx.fillStyle = '#181e28';
            ctx.beginPath();
            ctx.arc(prop.x + prop.w / 2, prop.y + prop.h / 2, 4, 0, Math.PI * 2);
            ctx.fill();
          } else if (prop.type === 'water_tank') {
            ctx.fillStyle = '#4a3728';
            ctx.beginPath();
            ctx.arc(prop.x, prop.y, prop.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#2d2218';
            ctx.lineWidth = 2;
            ctx.stroke();
          } else if (prop.type === 'radio_beacon') {
            // Antenna base
            ctx.strokeStyle = '#60728c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(prop.x - 8, prop.y + 8);
            ctx.lineTo(prop.x, prop.y - 12);
            ctx.lineTo(prop.x + 8, prop.y + 8);
            ctx.stroke();

            // Blinking red beacon tip
            var beaconBlink = Math.sin((timeSec || 0) * 5) > 0;
            ctx.save();
            ctx.fillStyle = beaconBlink ? '#ff1744' : '#550011';
            if (beaconBlink) {
              ctx.shadowColor = '#ff1744';
              ctx.shadowBlur = 10;
            }
            ctx.beginPath();
            ctx.arc(prop.x, prop.y - 12, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // Rooftop Neon Billboard Sign
        if (b.neonSign) {
          var ns = b.neonSign;
          ctx.save();

          // Sign frame & struts
          ctx.fillStyle = '#10141d';
          ctx.strokeStyle = '#2c3647';
          ctx.lineWidth = 2;
          VC.roundRect(ctx, ns.x - ns.w / 2, ns.y - ns.h / 2, ns.w, ns.h, 4);
          ctx.fill();
          ctx.stroke();

          // Neon Glow Text
          VC.drawGlowText(
            ctx,
            ns.text,
            ns.x,
            ns.y - 3,
            'bold 11px "Courier New", monospace',
            ns.color,
            ns.glow,
            12,
            'center'
          );

          if (ns.subText) {
            ctx.font = '7px monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(ns.subText, ns.x, ns.y + 6);
          }

          ctx.restore();
        }
      }
    },

    renderYSortedEntities: function(ctx, city, player, view, timeSec) {
      // Gather all entities and props into a single array for Y-sorting
      var sortList = [];

      // 1. Street Props
      for (var i = 0; i < city.props.length; i++) {
        var prp = city.props[i];
        if (prp.x >= view.left - 30 && prp.x <= view.right + 30 &&
            prp.y >= view.top - 30 && prp.y <= view.bottom + 30) {
          sortList.push({ type: 'prop', item: prp, sortY: prp.y });
        }
      }

      // 2. Palm Trees
      for (var t = 0; t < city.trees.length; t++) {
        var tr = city.trees[t];
        if (tr.x >= view.left - 50 && tr.x <= view.right + 50 &&
            tr.y >= view.top - 50 && tr.y <= view.bottom + 50) {
          sortList.push({ type: 'tree', item: tr, sortY: tr.y });
        }
      }

      // 3. Parked Vehicles
      for (var c = 0; c < city.parkedCars.length; c++) {
        var car = city.parkedCars[c];
        if (car.x >= view.left - 50 && car.x <= view.right + 50 &&
            car.y >= view.top - 50 && car.y <= view.bottom + 50) {
          sortList.push({ type: 'car', item: car, sortY: car.y });
        }
      }

      // 4. Player Entity
      if (player) {
        sortList.push({ type: 'player', item: player, sortY: player.y });
      }

      // Sort ascending by Y coordinate so foreground occludes background
      sortList.sort(function(a, b) {
        return a.sortY - b.sortY;
      });

      // Render each entity
      for (var k = 0; k < sortList.length; k++) {
        var ent = sortList[k];
        if (ent.type === 'player') {
          ent.item.render(ctx);
        } else if (ent.type === 'car') {
          this.renderVehicle(ctx, ent.item);
        } else if (ent.type === 'tree') {
          this.renderPalmTree(ctx, ent.item);
        } else if (ent.type === 'prop') {
          this.renderStreetProp(ctx, ent.item, timeSec);
        }
      }
    },

    renderVehicle: function(ctx, car) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      // Car body shape
      ctx.fillStyle = car.color;
      VC.roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Roof / Cabin
      ctx.fillStyle = car.roofColor || '#111111';
      VC.roundRect(ctx, -car.w * 0.28, -car.h * 0.38, car.w * 0.56, car.h * 0.76, 3);
      ctx.fill();

      // Tinted windshield & rear glass
      ctx.fillStyle = car.glassColor || '#0a1420';
      // Front windshield
      ctx.fillRect(car.w * 0.12, -car.h * 0.32, car.w * 0.12, car.h * 0.64);
      // Rear window
      ctx.fillRect(-car.w * 0.24, -car.h * 0.32, car.w * 0.1, car.h * 0.64);

      // Headlights (front edge)
      ctx.fillStyle = car.lightsOn ? '#fffbe6' : '#999988';
      ctx.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 2, 4);
      ctx.fillRect(car.w / 2 - 2, car.h / 2 - 7, 2, 4);

      // Taillights (rear edge)
      ctx.fillStyle = VC.PALETTE.taillightRed;
      ctx.fillRect(-car.w / 2, -car.h / 2 + 3, 2, 4);
      ctx.fillRect(-car.w / 2, car.h / 2 - 7, 2, 4);

      ctx.restore();
    },

    renderPalmTree: function(ctx, tree) {
      ctx.save();
      ctx.translate(tree.x, tree.y);

      // Trunk
      ctx.fillStyle = VC.PALETTE.palmTrunk;
      ctx.beginPath();
      ctx.arc(0, 0, tree.trunkRadius, 0, Math.PI * 2);
      ctx.fill();

      // Radiating lush palm fronds
      var numFronds = tree.fronds || 6;
      for (var f = 0; f < numFronds; f++) {
        var frondAngle = (f / numFronds) * Math.PI * 2 + tree.angleOffset;
        ctx.save();
        ctx.rotate(frondAngle);

        ctx.fillStyle = f % 2 === 0 ? VC.PALETTE.palmFrondLight : VC.PALETTE.palmFrondDark;
        ctx.beginPath();
        ctx.ellipse(tree.radius * 0.5, 0, tree.radius * 0.55, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      ctx.restore();
    },

    renderStreetProp: function(ctx, prop, timeSec) {
      if (prop.type === 'bench') {
        ctx.save();
        ctx.translate(prop.x, prop.y);
        ctx.rotate(prop.angle || 0);
        ctx.fillStyle = '#3a2b1c';
        ctx.fillRect(-14, -4, 28, 8);
        ctx.strokeStyle = '#18120c';
        ctx.lineWidth = 1;
        ctx.strokeRect(-14, -4, 28, 8);
        ctx.restore();
      } else if (prop.type === 'hydrant') {
        ctx.fillStyle = '#d91e36';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(prop.x - 2, prop.y - 2, 4, 4);
      } else if (prop.type === 'trash_can') {
        ctx.fillStyle = '#223026';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#141c16';
        ctx.stroke();
      } else if (prop.type === 'dumpster') {
        ctx.fillStyle = '#1d2b24';
        ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
        ctx.strokeStyle = '#0e1612';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(prop.x, prop.y, prop.w, prop.h);
      } else if (prop.type === 'fountain') {
        ctx.save();
        // Stone basin
        ctx.fillStyle = '#253342';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, prop.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3e526a';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Water surface
        var pGrad = ctx.createRadialGradient(prop.x, prop.y, 0, prop.x, prop.y, prop.radius - 4);
        pGrad.addColorStop(0, '#00b0ff');
        pGrad.addColorStop(1, '#004d80');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, prop.radius - 4, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing water ring
        var pRadius = 6 + (Math.sin((timeSec || 0) * 3 + prop.waterPulse) + 1) * 6;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, pRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    },

    renderLightingOverlay: function(ctx, city, view, timeSec) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // 1. Streetlight sodium light pools (warm elliptical glow on pavement)
      var lights = city.streetlights;
      for (var i = 0; i < lights.length; i++) {
        var lit = lights[i];
        if (lit.x < view.left - 100 || lit.x > view.right + 100 ||
            lit.y < view.top - 100 || lit.y > view.bottom + 100) continue;

        var poolRadius = lit.isFloodlight ? 140 : 85;
        VC.drawRadialLight(
          ctx,
          lit.x,
          lit.y,
          poolRadius,
          lit.isFloodlight ? 'rgba(255, 250, 220, 0.35)' : VC.PALETTE.sodiumGlow,
          'rgba(0,0,0,0)'
        );

        // Bright core at pole fixture
        ctx.fillStyle = VC.PALETTE.sodiumCore;
        ctx.beginPath();
        ctx.arc(lit.x, lit.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Car headlights soft light cones
      var cars = city.parkedCars;
      for (var c = 0; c < cars.length; c++) {
        var car = cars[c];
        if (!car.lightsOn) continue;
        if (car.x < view.left - 120 || car.x > view.right + 120 ||
            car.y < view.top - 120 || car.y > view.bottom + 120) continue;

        ctx.save();
        ctx.translate(car.x, car.y);
        ctx.rotate(car.angle);

        // Conical beam projection
        var beamGrad = ctx.createLinearGradient(car.w / 2, 0, car.w / 2 + 130, 0);
        beamGrad.addColorStop(0, VC.PALETTE.headlightBeam);
        beamGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(car.w / 2, -car.h / 2 + 3);
        ctx.lineTo(car.w / 2 + 130, -55);
        ctx.lineTo(car.w / 2 + 130, 55);
        ctx.lineTo(car.w / 2, car.h / 2 - 3);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // 3. Neon signs ambient radial halos
      var signs = city.neonSigns;
      for (var s = 0; s < signs.length; s++) {
        var sign = signs[s];
        if (sign.x < view.left - 150 || sign.x > view.right + 150 ||
            sign.y < view.top - 150 || sign.y > view.bottom + 150) continue;

        VC.drawRadialLight(
          ctx,
          sign.x,
          sign.y,
          100,
          sign.glow || 'rgba(0, 240, 255, 0.45)',
          'rgba(0,0,0,0)'
        );
      }

      ctx.restore();
    },

    renderScreenAtmosphere: function(ctx, timeSec) {
      // 1. Subtle Teal Coastal Night Haze
      ctx.save();
      var hazeGrad = ctx.createLinearGradient(0, 0, 1280, 800);
      hazeGrad.addColorStop(0, 'rgba(4, 18, 28, 0.16)');
      hazeGrad.addColorStop(1, 'rgba(12, 6, 24, 0.14)');
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(0, 0, 1280, 800);

      // 2. Faint wet rain mist particles glistening in the air
      ctx.strokeStyle = 'rgba(180, 220, 255, 0.18)';
      ctx.lineWidth = 1;
      var rainT = (timeSec || 0) * 800;
      for (var r = 0; r < 28; r++) {
        var rx = (r * 47 + rainT * 0.4) % 1280;
        var ry = (r * 31 + rainT) % 800;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + 3, ry + 12);
        ctx.stroke();
      }

      // 3. Cinematic Vignette around screen borders
      var vigGrad = ctx.createRadialGradient(640, 400, 380, 640, 400, 780);
      vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vigGrad.addColorStop(1, 'rgba(2, 4, 10, 0.82)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, 1280, 800);

      ctx.restore();
    }
  };

  VC.Renderer = Renderer;
})();
