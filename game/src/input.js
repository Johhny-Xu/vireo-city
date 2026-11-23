// Input management for keyboard and mouse
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var keys = {};
  var keysJustPressed = {};
  var mouse = {
    screenX: 640,
    screenY: 400,
    worldX: 640,
    worldY: 400,
    down: false,
    justPressed: false,
    rightDown: false
  };

  var preventKeys = {
    'ArrowUp': true, 'ArrowDown': true, 'ArrowLeft': true, 'ArrowRight': true,
    'Space': true, 'Tab': true, 'F5': true, 'F9': true
  };

  var canvasEl = null;

  function onKeyDown(e) {
    if (preventKeys[e.code] || e.code === 'Tab') {
      e.preventDefault();
    }
    if (!keys[e.code]) {
      keysJustPressed[e.code] = true;
    }
    keys[e.code] = true;

    // Wake audio on user interaction
    if (VC.Audio) VC.Audio.init();
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  function updateMouseCoords(e) {
    if (!canvasEl) return;
    var rect = canvasEl.getBoundingClientRect();
    var scaleX = 1280 / rect.width;
    var scaleY = 800 / rect.height;

    mouse.screenX = (e.clientX - rect.left) * scaleX;
    mouse.screenY = (e.clientY - rect.top) * scaleY;

    if (VC.camera) {
      var worldPt = VC.camera.screenToWorld(mouse.screenX, mouse.screenY);
      mouse.worldX = worldPt.x;
      mouse.worldY = worldPt.y;
    } else {
      mouse.worldX = mouse.screenX;
      mouse.worldY = mouse.screenY;
    }
  }

  function onMouseMove(e) {
    updateMouseCoords(e);
  }

  function onMouseDown(e) {
    updateMouseCoords(e);
    if (e.button === 0) {
      if (!mouse.down) mouse.justPressed = true;
      mouse.down = true;
    } else if (e.button === 2) {
      mouse.rightDown = true;
      e.preventDefault();
    }
    if (VC.Audio) VC.Audio.init();
  }

  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  var Input = {
    init: function(canvas) {
      canvasEl = canvas;
      window.addEventListener('keydown', onKeyDown, { passive: false });
      window.addEventListener('keyup', onKeyUp, { passive: false });
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('mousedown', onMouseDown, { passive: false });
      window.addEventListener('mouseup', onMouseUp, { passive: true });
      window.addEventListener('contextmenu', onContextMenu, { passive: false });
    },

    isDown: function(code) {
      return !!keys[code];
    },

    justPressed: function(code) {
      return !!keysJustPressed[code];
    },

    getMovementVector: function() {
      var dx = 0;
      var dy = 0;
      if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }
      return { x: dx, y: dy, len: len };
    },

    isSprinting: function() {
      return !!(keys['ShiftLeft'] || keys['ShiftRight']);
    },

    mouse: mouse,

    update: function() {
      // Clear one-frame justPressed buffers
      keysJustPressed = {};
      mouse.justPressed = false;

      // Keep mouse world coordinates in sync with camera if camera moved
      if (VC.camera) {
        var worldPt = VC.camera.screenToWorld(mouse.screenX, mouse.screenY);
        mouse.worldX = worldPt.x;
        mouse.worldY = worldPt.y;
      }
    }
  };

  VC.Input = Input;
})();
