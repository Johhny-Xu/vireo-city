// Wanted level system (0-5 stars) with crime tracking and police sight decay
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  // ── Crime definitions ──────────────────────────────────────────────────────
  var CRIME_STARS = {
    stole_car:       1,
    hit_pedestrian:  1,
    fired_weapon:    1,
    rammed_police:   2,
    killed_civilian: 2,
    killed_officer:  3
  };

  // After this many seconds out of police line-of-sight the level starts dropping
  var SIGHT_LOSS_THRESHOLD = 6.0;    // seconds until "losing them"
  var DECAY_INTERVAL       = 12.0;   // seconds to drop one star once hidden
  var DECAY_BLINK_WINDOW   = 4.0;    // seconds of "WANTED" blinking just before each star drop
  var COOLDOWN_AFTER_CRIME = 3.0;    // prevent double-counting the same crime
  var spotFeedbackTimer = 0;
  var spotBannerCooldown = 0;

  // ── State ──────────────────────────────────────────────────────────────────
  var level         = 0;    // 0-5 stars
  var sightTimer    = 0;    // seconds since police last saw player
  var decayTimer    = 0;    // countdown to drop one star
  var isLosing      = false; // true when sightTimer > threshold
  var crimeCooldowns = {};

  var Wanted = {
    get level() { return level; },
    get spotFeedback() { return spotFeedbackTimer; },

    isPlayerConcealed: function(player, city) {
      if (!player) return false;
      var p = player.vehicle ? player.vehicle : player;
      if (city && city.tunnels) {
        for (var t = 0; t < city.tunnels.length; t++) {
          var tun = city.tunnels[t];
          if (p.x >= tun.x && p.x <= tun.x + tun.w && p.y >= tun.y && p.y <= tun.y + tun.h) return true;
        }
      }
      if (city && city.buildings) {
        for (var b = 0; b < city.buildings.length; b++) {
          var bd = city.buildings[b];
          var sh = bd.shadowHeight || 30;
          if (p.x >= bd.x - 12 && p.x <= bd.x + bd.w + sh * 0.6 + 12 &&
              p.y >= bd.y - 12 && p.y <= bd.y + bd.h + sh + 12) return true;
        }
      }
      return false;
    },

    addCrime: function(crimeKey, player) {
      if (!CRIME_STARS[crimeKey]) return;
      // Cooldown to avoid spam
      if (crimeCooldowns[crimeKey] && crimeCooldowns[crimeKey] > 0) return;
      crimeCooldowns[crimeKey] = COOLDOWN_AFTER_CRIME;

      var add = CRIME_STARS[crimeKey];
      level = Math.min(6, level + add);

      // Write back to player object if provided
      if (player) player.wantedLevel = level;
      else if (VC.player) VC.player.wantedLevel = level;

      // Reset decay when a new crime is committed
      sightTimer = 0;
      isLosing = false;
      decayTimer = DECAY_INTERVAL;

      if (level > 0) {
        if (VC.hud) VC.hud.toast('WANTED: ' + level + ' STAR' + (level > 1 ? 'S' : ''), 2.0);
        if (VC.Audio) VC.Audio.uiBlip(200 + level * 60);
        // Trigger police if level >= 1
        if (VC.police) VC.police.onWantedLevelChange(level);
      }
    },

    // Called by police when they spot the player
    registerPoliceSpot: function() {
      sightTimer = 0;
      isLosing = false;
      decayTimer = DECAY_INTERVAL;
      spotFeedbackTimer = 0.9;
      if (VC.combat && VC.combat.triggerPoliceSpot) VC.combat.triggerPoliceSpot();
      if (spotBannerCooldown <= 0 && VC.hud) {
        VC.hud.toast('警察看到了你 // 藏匿衰减已重置', 1.6);
        spotBannerCooldown = 2.5;
      }
      if (VC.Audio) VC.Audio.startSiren();
    },

    // Drop the level by delta stars (clamped to 0)
    reduceLevel: function(delta, player) {
      level = Math.max(0, level - (delta || 1));
      if (player) player.wantedLevel = level;
      else if (VC.player) VC.player.wantedLevel = level;
      if (VC.police) VC.police.onWantedLevelChange(level);
    },

    setLevel: function(val, player) {
      level = Math.max(0, Math.min(6, val));
      if (player) player.wantedLevel = level;
      else if (VC.player) VC.player.wantedLevel = level;
      if (VC.police) VC.police.onWantedLevelChange(level);
    },

    isDecaying: function() { return isLosing; },

    decayFraction: function() {
      // 0-1 progress toward next star drop (useful for HUD)
      if (!isLosing || level === 0) return 0;
      return 1 - (decayTimer / DECAY_INTERVAL);
    },

    // Returns true during DECAY_BLINK_WINDOW before each drop
    isBlinking: function() {
      return isLosing && level > 0 && decayTimer <= DECAY_BLINK_WINDOW;
    },

    update: function(dt) {
      // Tick cooldowns
      var keys = Object.keys(crimeCooldowns);
      for (var k = 0; k < keys.length; k++) {
        crimeCooldowns[keys[k]] -= dt;
      }
      if (spotFeedbackTimer > 0) spotFeedbackTimer = Math.max(0, spotFeedbackTimer - dt);
      if (spotBannerCooldown > 0) spotBannerCooldown = Math.max(0, spotBannerCooldown - dt);

      if (level <= 0) {
        isLosing = false;
        sightTimer = 0;
        decayTimer = DECAY_INTERVAL;
        return;
      }

      sightTimer += dt;

      if (sightTimer >= SIGHT_LOSS_THRESHOLD) {
        isLosing = true;
      }

      if (isLosing) {
        decayTimer -= dt;
        if (decayTimer <= 0) {
          level = Math.max(0, level - 1);
          decayTimer = DECAY_INTERVAL;
          if (VC.player) VC.player.wantedLevel = level;
          if (level === 0) {
            isLosing = false;
            sightTimer = 0;
            if (VC.hud) VC.hud.toast('EVADED POLICE', 2.0);
            if (VC.Audio) VC.Audio.uiBlip(1100);
          } else {
            if (VC.hud) VC.hud.toast('WANTED: ' + level + ' STAR' + (level > 1 ? 'S' : ''), 1.5);
          }
          if (VC.police) VC.police.onWantedLevelChange(level);
        }
      }
    }
  };

  VC.wanted = Wanted;
})();
