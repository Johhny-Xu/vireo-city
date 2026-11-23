// Save / Load system — localStorage, F5/F9 key hooks, graceful fallback
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var SAVE_KEY = 'vireo_city_save_v2';

  var Save = {
    exists: function() {
      try {
        return !!localStorage.getItem(SAVE_KEY);
      } catch (e) {
        return false;
      }
    },

    save: function(player) {
      if (!player) return false;
      try {
        var data = {
          version: 2,
          seed: 1986,
          x: player.x,
          y: player.y,
          health: player.health,
          armor: player.armor,
          cash: player.cash,
          wantedLevel: VC.wanted ? VC.wanted.level : player.wantedLevel,
          weaponKey: VC.Weapons ? VC.Weapons.state.current : 'fists',
          weaponClip: VC.Weapons ? VC.Weapons.state.clip : 0,
          weaponReserve: VC.Weapons ? VC.Weapons.state.reserve : 0,
          stamina: typeof player.stamina === 'number' ? player.stamina : 100,
          pickupState: VC.Weapons ? VC.Weapons.getSaveData ? VC.Weapons.getSaveData() : null : null,
          missions: VC.Missions ? VC.Missions.toSaveData() : null,
          ts: Date.now()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        // Update menu so "Continue" appears
        if (VC.Menu) VC.Menu.hasSave = true;
        if (VC.hud) VC.hud.showSavedToast();
        if (VC.Audio) VC.Audio.uiBlip(1100);
        return true;
      } catch (e) {
        if (VC.hud) VC.hud.toast('SAVE FAILED', 2.0);
        return false;
      }
    },

    load: function(player) {
      if (!player) return false;
      try {
        var str = localStorage.getItem(SAVE_KEY);
        if (!str) return false;
        var data = JSON.parse(str);
        if (!data || typeof data !== 'object') throw new Error('corrupt');

        player.x      = typeof data.x      === 'number' ? data.x      : player.x;
        player.y      = typeof data.y      === 'number' ? data.y      : player.y;
        player.health = typeof data.health === 'number' ? data.health : 100;
        player.armor  = typeof data.armor  === 'number' ? data.armor  : 0;
        player.cash   = typeof data.cash   === 'number' ? data.cash   : 0;
        player.stamina = typeof data.stamina === 'number' ? data.stamina : player.maxStamina;

        if (VC.wanted && typeof data.wantedLevel === 'number') {
          VC.wanted.setLevel(data.wantedLevel, player);
        } else if (typeof data.wantedLevel === 'number') {
          player.wantedLevel = data.wantedLevel;
        }

        if (VC.Weapons && data.weaponKey) {
          VC.Weapons.equip(data.weaponKey);
          if (typeof data.weaponClip    === 'number') VC.Weapons.state.clip    = data.weaponClip;
          if (typeof data.weaponReserve === 'number') VC.Weapons.state.reserve = data.weaponReserve;
          if (data.pickupState && VC.Weapons.fromSaveData) VC.Weapons.fromSaveData(data.pickupState);
        }

        if (VC.Missions && data.missions) {
          VC.Missions.fromSaveData(data.missions);
        }

        if (VC.camera) VC.camera.snapTo(player.x, player.y);
        if (VC.hud) VC.hud.toast('GAME LOADED (F9)', 2.0);
        if (VC.Audio) VC.Audio.uiBlip(1250);
        return true;
      } catch (e) {
        // Corrupt save — wipe and fall back to new game
        try { localStorage.removeItem(SAVE_KEY); } catch (e2) {}
        if (VC.hud) VC.hud.toast('SAVE DATA CORRUPT — NEW GAME', 3.0);
        return false;
      }
    },

    clear: function() {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      if (VC.Menu) VC.Menu.hasSave = false;
    }
  };

  VC.Save = Save;
})();
