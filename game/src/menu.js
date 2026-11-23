// Title screen, menus, and pause overlays for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var Menu = {
    state: 'title', // 'title', 'controls', 'credits', 'paused'
    selectedIndex: 0,
    hasSave: false,

    init: function() {
      // Delegate to Save system if available, fall back to old key
      if (VC.Save) {
        this.hasSave = VC.Save.exists();
      } else {
        try {
          this.hasSave = !!localStorage.getItem('vireo_city_save');
        } catch (e) {
          this.hasSave = false;
        }
      }
    },

    saveGame: function(player) {
      if (VC.Save) return VC.Save.save(player);
      if (!player) return false;
      try {
        var data = {
          x: player.x, y: player.y, health: player.health,
          armor: player.armor, cash: player.cash, wantedLevel: player.wantedLevel
        };
        localStorage.setItem('vireo_city_save', JSON.stringify(data));
        this.hasSave = true;
        if (VC.hud) VC.hud.toast('GAME SAVED (F5)', 2.0);
        if (VC.Audio) VC.Audio.uiBlip(1100);
        return true;
      } catch (e) { return false; }
    },

    loadGame: function(player) {
      if (VC.Save) return VC.Save.load(player);
      if (!player) return false;
      try {
        var str = localStorage.getItem('vireo_city_save');
        if (!str) return false;
        var data = JSON.parse(str);
        player.x = data.x; player.y = data.y;
        player.health = data.health; player.armor = data.armor;
        player.cash = data.cash; player.wantedLevel = data.wantedLevel;
        if (VC.camera) VC.camera.snapTo(player.x, player.y);
        if (VC.hud) VC.hud.toast('GAME LOADED (F9)', 2.0);
        if (VC.Audio) VC.Audio.uiBlip(1250);
        return true;
      } catch (e) { return false; }
    },

    update: function(dt) {
      var input = VC.Input;
      if (!input) return;

      if (this.state === 'title') {
        if (input.justPressed('ArrowDown') || input.justPressed('KeyS')) {
          this.selectedIndex = (this.selectedIndex + 1) % 4;
          if (this.selectedIndex === 1 && !this.hasSave) {
            this.selectedIndex = 2; // skip disabled Continue
          }
          if (VC.Audio) VC.Audio.uiBlip(800);
        } else if (input.justPressed('ArrowUp') || input.justPressed('KeyW')) {
          this.selectedIndex = (this.selectedIndex + 3) % 4;
          if (this.selectedIndex === 1 && !this.hasSave) {
            this.selectedIndex = 0; // skip disabled Continue
          }
          if (VC.Audio) VC.Audio.uiBlip(800);
        } else if (input.justPressed('Enter') || input.justPressed('Space')) {
          this.activateOption(this.selectedIndex);
        }

        // Mouse hover & click support on menu items
        var mx = input.mouse.screenX;
        var my = input.mouse.screenY;
        var startY = 460;
        var itemH = 44;
        for (var i = 0; i < 4; i++) {
          var iy = startY + i * itemH;
          if (mx >= 440 && mx <= 840 && my >= iy - 16 && my <= iy + 20) {
            if (this.selectedIndex !== i && (i !== 1 || this.hasSave)) {
              this.selectedIndex = i;
              if (VC.Audio) VC.Audio.uiBlip(750);
            }
            if (input.mouse.justPressed) {
              this.activateOption(i);
            }
          }
        }
      } else if (this.state === 'controls' || this.state === 'credits') {
        if (input.justPressed('Escape') || input.justPressed('Enter') || input.justPressed('Space') || input.mouse.justPressed) {
          this.state = 'title';
          if (VC.Audio) VC.Audio.uiBlip(700);
        }
      }
    },

    activateOption: function(index) {
      if (index === 0) {
        // Start Game
        if (VC.Audio) {
          VC.Audio.uiBlip(1200);
          VC.Audio.startMusic();
        }
        VC.gameState = 'playing';
      } else if (index === 1) {
        // Continue
        if (this.hasSave && VC.player) {
          this.loadGame(VC.player);
          if (VC.Audio) {
            VC.Audio.uiBlip(1200);
            VC.Audio.startMusic();
          }
          VC.gameState = 'playing';
        }
      } else if (index === 2) {
        // Controls
        this.state = 'controls';
        if (VC.Audio) VC.Audio.uiBlip(950);
      } else if (index === 3) {
        // Credits
        this.state = 'credits';
        if (VC.Audio) VC.Audio.uiBlip(950);
      }
    },

    render: function(ctx, timeSec) {
      if (this.state === 'title') {
        this.renderTitleScreen(ctx, timeSec);
      } else if (this.state === 'controls') {
        this.renderControlsModal(ctx);
      } else if (this.state === 'credits') {
        this.renderCreditsModal(ctx);
      }
    },

    renderTitleScreen: function(ctx, timeSec) {
      ctx.save();

      // Atmospheric dark vignette backdrop overlay so background city peaks through
      var bgGrad = ctx.createRadialGradient(640, 400, 100, 640, 400, 720);
      bgGrad.addColorStop(0, 'rgba(4, 8, 16, 0.65)');
      bgGrad.addColorStop(1, 'rgba(2, 4, 10, 0.94)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1280, 800);

      // Top decorative header line
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(180, 90); ctx.lineTo(1100, 90);
      ctx.stroke();

      // Retro horizon grid lines in lower half
      ctx.strokeStyle = 'rgba(255, 0, 127, 0.15)';
      ctx.lineWidth = 1;
      for (var gy = 440; gy < 800; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gy); ctx.lineTo(1280, gy);
        ctx.stroke();
      }

      // Title Logo: "VIREO CITY"
      var titleY = 220;
      // Magenta shadow drop pass
      VC.drawGlowText(
        ctx,
        'VIREO CITY',
        642,
        titleY + 5,
        '900 84px "Impact", "Arial Black", sans-serif',
        '#ff007f',
        'rgba(255, 0, 127, 0.9)',
        28,
        'center'
      );

      // Cyan outer glow pass
      VC.drawGlowText(
        ctx,
        'VIREO CITY',
        640,
        titleY,
        '900 84px "Impact", "Arial Black", sans-serif',
        '#00f0ff',
        'rgba(0, 240, 255, 0.85)',
        18,
        'center'
      );

      // Crisp white core
      ctx.font = '900 84px "Impact", "Arial Black", sans-serif';
      ctx.fillStyle = '#f8feff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VIREO CITY', 640, titleY);

      // Subtitle
      VC.drawGlowText(
        ctx,
        'NOCTURNE OVER VICE COAST',
        640,
        titleY + 68,
        'bold 18px "Courier New", monospace',
        '#ffd54f',
        'rgba(255, 213, 79, 0.6)',
        10,
        'center'
      );

      // Menu Options
      var items = [
        'START GAME',
        this.hasSave ? 'CONTINUE' : 'CONTINUE (NO SAVE)',
        'CONTROLS',
        'CREDITS'
      ];

      var startY = 460;
      var itemH = 46;

      for (var i = 0; i < items.length; i++) {
        var iy = startY + i * itemH;
        var isSelected = this.selectedIndex === i;
        var isDisabled = i === 1 && !this.hasSave;

        if (isSelected) {
          // Highlight background bar
          ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1.5;
          VC.roundRect(ctx, 450, iy - 18, 380, 36, 6);
          ctx.fill();
          ctx.stroke();

          VC.drawGlowText(
            ctx,
            '▶  ' + items[i] + '  ◀',
            640,
            iy,
            'bold 20px "Courier New", monospace',
            '#ffffff',
            '#00f0ff',
            12,
            'center'
          );
        } else {
          var itemColor = isDisabled ? '#4a5768' : '#a0b4cc';
          ctx.font = 'bold 18px "Courier New", monospace';
          ctx.fillStyle = itemColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(items[i], 640, iy);
        }
      }

      // Blinking hint at bottom
      var blink = (Math.sin((timeSec || 0) * 4) + 1) / 2;
      ctx.save();
      ctx.globalAlpha = 0.35 + blink * 0.65;
      VC.drawGlowText(
        ctx,
        'PRESS ENTER OR CLICK TO PLAY',
        640,
        710,
        'bold 14px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.7)',
        8,
        'center'
      );
      ctx.restore();

      ctx.restore();
    },

    renderControlsModal: function(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 8, 16, 0.95)';
      ctx.fillRect(0, 0, 1280, 800);

      VC.drawGlowText(
        ctx,
        'CONTROLS & SHORTCUTS',
        640,
        140,
        'bold 28px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.7)',
        14,
        'center'
      );

      var controls = [
        ['WASD / Arrow Keys', 'Walk in 8 directions'],
        ['Shift (Hold)', 'Sprint / Run fast'],
        ['Mouse Aim', 'Aim weapon & directional facing'],
        ['Left Click', 'Attack (Punch fists / Fire)'],
        ['F Key', 'Enter / Exit vehicle'],
        ['E Key', 'Interact with environment'],
        ['Tab / M', 'Toggle Fullscreen City Map'],
        ['ESC', 'Pause / Unpause Game'],
        ['F5 / F9', 'Quick Save / Quick Load'],
        [', (Comma)', 'Toggle Synthwave Music Bed']
      ];

      var startY = 220;
      var lineH = 36;
      ctx.font = '16px "Courier New", monospace';
      for (var i = 0; i < controls.length; i++) {
        var cy = startY + i * lineH;
        ctx.fillStyle = '#ffaa00';
        ctx.textAlign = 'right';
        ctx.fillText(controls[i][0], 580, cy);

        ctx.fillStyle = '#445566';
        ctx.textAlign = 'center';
        ctx.fillText(':', 610, cy);

        ctx.fillStyle = '#e0ecf8';
        ctx.textAlign = 'left';
        ctx.fillText(controls[i][1], 640, cy);
      }

      VC.drawGlowText(
        ctx,
        '[ Press ESC or CLICK to Return ]',
        640,
        660,
        'bold 15px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.5)',
        8,
        'center'
      );

      ctx.restore();
    },

    renderCreditsModal: function(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 8, 16, 0.95)';
      ctx.fillRect(0, 0, 1280, 800);

      VC.drawGlowText(
        ctx,
        'VIREO CITY',
        640,
        180,
        '900 38px "Impact", "Arial Black", sans-serif',
        '#00f0ff',
        'rgba(0, 240, 255, 0.8)',
        16,
        'center'
      );

      VC.drawGlowText(
        ctx,
        'NOCTURNE OVER VICE COAST',
        640,
        224,
        'bold 16px "Courier New", monospace',
        '#ffaa00',
        'rgba(255, 170, 0, 0.6)',
        8,
        'center'
      );

      var lines = [
        'An original procedural open-world crime game engine',
        'Built entirely in canvas 2D with zero external dependencies',
        'Procedural City Generation (Mulberry32 PRNG)',
        'Night-time Neon Aesthetics & Wet Asphalt Reflections',
        'WebAudio Procedural Sound Synthesizer',
        'Created for the make.fun bounty "Make GTA 6"'
      ];

      ctx.font = '16px "Courier New", monospace';
      ctx.fillStyle = '#d0deee';
      ctx.textAlign = 'center';
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 640, 310 + i * 40);
      }

      VC.drawGlowText(
        ctx,
        '[ Press ESC or CLICK to Return ]',
        640,
        640,
        'bold 15px "Courier New", monospace',
        '#00f0ff',
        'rgba(0, 240, 255, 0.5)',
        8,
        'center'
      );

      ctx.restore();
    }
  };

  VC.Menu = Menu;
})();
