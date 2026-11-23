// Color palette & procedural drawing primitives for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var PALETTE = {
    // Radar and exposure colors are kept bright for small review thumbnails.
    radarBackground: '#050b14',
    radarGrid: '#67d7ef',
    radarPlayer: '#ffeb3b',
    radarPolice: '#ff1744',
    radarObjective: '#ffc400',
    // Night & atmosphere
    skyVoid: '#04070d',
    tealHaze: 'rgba(10, 32, 44, 0.45)',
    nightAmbient: 'rgba(3, 7, 15, 0.68)',
    shadowSoft: 'rgba(2, 4, 8, 0.75)',
    shadowHard: 'rgba(1, 2, 5, 0.9)',

    // Roads & sidewalks
    asphaltDark: '#0c1018',
    asphaltBase: '#121722',
    asphaltWetShine: '#1d273a',
    asphaltSpecular: 'rgba(90, 140, 180, 0.18)',
    roadYellow: '#f5b041',
    roadWhite: 'rgba(230, 240, 255, 0.85)',
    crosswalkWhite: 'rgba(240, 245, 255, 0.9)',
    sidewalkDark: '#1c222e',
    sidewalkBase: '#252e3d',
    sidewalkLight: '#323d50',
    curbEdge: '#161c26',
    curbHighlight: '#445168',

    // Nature & coastal
    grassDark: '#081611',
    grassBase: '#0e261d',
    grassLush: '#15382b',
    palmTrunk: '#281c14',
    palmFrondDark: '#0b2e1e',
    palmFrondLight: '#185c3e',
    oceanDeep: '#02060d',
    oceanMid: '#061626',
    oceanSurface: '#0c263d',
    oceanFoam: 'rgba(80, 200, 240, 0.4)',
    pierPlankDark: '#1a140f',
    pierPlankBase: '#292019',
    pierPost: '#3d3026',

    // Sodium and headlights
    sodiumCore: '#fff3d1',
    sodiumMid: '#ffaa33',
    sodiumGlow: 'rgba(255, 170, 51, 0.28)',
    headlightBeam: 'rgba(255, 245, 210, 0.35)',
    taillightRed: '#ff2244',
    taillightGlow: 'rgba(255, 34, 68, 0.45)',

    // Neon signs
    neonCyan: '#00f0ff',
    neonCyanGlow: 'rgba(0, 240, 255, 0.55)',
    neonMagenta: '#ff007f',
    neonMagentaGlow: 'rgba(255, 0, 127, 0.55)',
    neonPurple: '#b347ff',
    neonPurpleGlow: 'rgba(179, 71, 255, 0.55)',
    neonAmber: '#ffaa00',
    neonAmberGlow: 'rgba(255, 170, 0, 0.55)',
    neonLime: '#39ff14',
    neonLimeGlow: 'rgba(57, 255, 20, 0.55)',
    neonWhite: '#f0faff',

    // Architecture & windows
    roofBase: ['#121620', '#161c28', '#10141d', '#1b2230', '#141a24'],
    roofDetail: '#232b3c',
    roofParapet: '#0e121a',
    windowLitAmber: ['#ffe082', '#ffd54f', '#ffca28', '#ffb300'],
    windowLitCyan: ['#80deea', '#4dd0e1', '#26c6da', '#00e5ff'],
    windowLitMagenta: ['#f48fb1', '#f06292', '#ec407a', '#ff4081'],
    windowDark: '#0a0d13',

    // Vehicles
    carColors: [
      { body: '#d91e36', roof: '#b0162a', glass: '#0c2233' }, // Crimson Sports
      { body: '#00adb5', roof: '#00858c', glass: '#081c26' }, // Teal Cruiser
      { body: '#eeeeee', roof: '#cccccc', glass: '#101924' }, // Pearlescent White
      { body: '#f39c12', roof: '#c87f0a', glass: '#1c1b18' }, // Sunset Coupe
      { body: '#222831', roof: '#181c22', glass: '#0d131a' }, // Midnight Sedan
      { body: '#8e44ad', roof: '#6c3483', glass: '#180e24' }, // Royal Violet Lowrider
      { body: '#27ae60', roof: '#1e8449', glass: '#0d2016' }  // Emerald Muscle
    ],

    // Player
    playerJacket: '#1c2436',
    playerJacketCollar: '#2d3b56',
    playerPants: '#0e1219',
    playerBoots: '#05070a',
    playerSkin: '#e0a98b',
    playerHair: '#1a130e'
  };

  // Drawing helpers
  function roundRect(ctx, x, y, w, h, radius) {
    if (radius === undefined) radius = 4;
    if (typeof radius === 'number') {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
      var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
      for (var side in defaultRadius) {
        radius[side] = radius[side] || defaultRadius[side];
      }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + w - radius.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius.tr);
    ctx.lineTo(x + w, y + h - radius.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h);
    ctx.lineTo(x + radius.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
  }

  function drawGlowText(ctx, text, x, y, font, color, glowColor, blur, align) {
    ctx.save();
    ctx.font = font || '16px monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (glowColor && blur > 0) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = blur;
    }
    ctx.fillStyle = color || '#ffffff';
    ctx.fillText(text, x, y);
    // Extra core pass for punchiness
    ctx.shadowBlur = 0;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawSoftShadow(ctx, x, y, w, h, blur, color) {
    ctx.save();
    ctx.shadowColor = color || PALETTE.shadowSoft;
    ctx.shadowBlur = blur || 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = color || PALETTE.shadowSoft;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function drawRadialLight(ctx, cx, cy, radius, innerColor, outerColor) {
    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(1, outerColor || 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEllipticalLight(ctx, cx, cy, rx, ry, innerColor, outerColor) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(1, outerColor || 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  VC.PALETTE = PALETTE;
  VC.roundRect = roundRect;
  VC.drawGlowText = drawGlowText;
  VC.drawSoftShadow = drawSoftShadow;
  VC.drawRadialLight = drawRadialLight;
  VC.drawEllipticalLight = drawEllipticalLight;
})();
