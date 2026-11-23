// Mission chain (8 original missions) for Vireo City
(function() {
  'use strict';
  // Mission comment: explicit prerequisite state and radio aftermath make the late chain causally continuous.

  var VC = window.VC = window.VC || {};

  // ── Mission definitions ────────────────────────────────────────────────────
  // Cast: Mira Voss (fixer), Dex Nouri (dock boss), Lena Falk (courier),
  //       The Recto Crew (rival gang), Chief (player callsign)
  var MISSION_LIST = [
    {
      id: 'intro_job',
      title: 'First Contact',
      briefing: '"Chief. I\'m Mira Voss. You look hungry enough to work. Meet me at the docks." — MIRA',
      reward: 800,
      markerX: 760, markerY: 440,
      objectives: [
        { type: 'goto',   label: 'Drive to the dockside warehouse', x: 760, y: 440, radius: 48 }
      ]
    },
    {
      id: 'grab_the_van',
      title: 'Cargo Grab',
      briefing: '"Dex needs that cargo van impounded at the east lot. Take it, don\'t break it." — MIRA',
      reward: 1400,
      markerX: 1100, markerY: 720,
      objectives: [
        { type: 'goto',   label: 'Find the Hauler at the east lot', x: 1100, y: 720, radius: 60 },
        { type: 'steal_vehicle', label: 'Jack the Hauler', vehicleType: 'hauler' },
        { type: 'deliver', label: 'Deliver to the warehouse',       x: 760,  y: 440, radius: 55 }
      ]
    },
    {
      id: 'escort_lena',
      title: 'Safe Passage',
      briefing: '"Lena Falk is running a package uptown. Keep the Recto dogs off her tail." — MIRA',
      reward: 2200,
      markerX: 500, markerY: 580,
      objectives: [
        { type: 'goto',   label: 'Pick up Lena at Meridian Ave',    x: 500, y: 580, radius: 55 },
        { type: 'lose_wanted', label: 'Lose any heat — wanted must be 0' },
        { type: 'deliver', label: 'Drop Lena at Crow Street',       x: 850, y: 300, radius: 55 }
      ]
    },
    {
      id: 'recto_message',
      title: 'Hard Message',
      briefing: '"The Recto Crew hijacked Dex\'s shipment. Send three of their runners a message." — DEX',
      reward: 3000,
      markerX: 1200, markerY: 900,
      objectives: [
        { type: 'goto',       label: 'Go to the Recto stash house',    x: 1200, y: 900, radius: 60 },
        { type: 'takeout',    label: 'Neutralise 3 Recto runners',     count: 3, done: 0 },
        { type: 'goto',       label: 'Report back to Dex',             x: 760,  y: 440, radius: 55 }
      ]
    },
    {
      id: 'interceptor_heist',
      title: 'Badge & Chrome',
      briefing: '"We need a clean Interceptor to run the port checkpoint. Take one, lose the heat." — MIRA',
      reward: 4500,
      markerX: 920, markerY: 650,
      objectives: [
        { type: 'steal_vehicle', label: 'Jack a police Interceptor',  vehicleType: 'interceptor' },
        { type: 'lose_wanted',   label: 'Lose all wanted stars' },
        { type: 'deliver',       label: 'Bring the Interceptor to Mira', x: 650, y: 390, radius: 55 }
      ]
    },
    {
      id: 'final_run',
      title: 'The Long Goodbye',
      briefing: '"One last run. Big package, Dex\'s buyer, the port. After this — we disappear." — MIRA',
      reward: 8000,
      markerX: 740, markerY: 300,
      objectives: [
        { type: 'goto',   label: 'Collect the package at Vireo Docks',  x: 740,  y: 300, radius: 60 },
        { type: 'lose_wanted', label: 'Escape with wanted level 0' },
        { type: 'deliver', label: 'Deliver to the buyer at Coral Pier',  x: 2300, y: 850, radius: 65 }
      ]
    },
    {
      id: 'ghost_convoy',
      title: 'Ghost Convoy',
      briefing: '"The Long Goodbye was a lie. VPD found the buyer and Lena is being moved. Get to Meridian, and keep the convoy on the road." — LENA',
      reward: 10500,
      markerX: 500, markerY: 580,
      objectives: [
        { type: 'goto', label: 'Meet Lena at the Meridian underpass', x: 500, y: 580, radius: 55 },
        { type: 'survive_chase', label: 'Escort Lena through the pursuit — survive 45 seconds', seconds: 45, done: 0 },
        { type: 'deliver', label: 'Lose the tail and reach the canal safehouse', x: 850, y: 300, radius: 55 }
      ]
    },
    {
      id: 'black_sun',
      title: 'Black Sun',
      briefing: '"Chief, Dex sold both crews to VPD. Mira has the vault key. We finish this before sunrise — all of Vireo is watching." — MIRA',
      reward: 18000,
      markerX: 1200, markerY: 900,
      objectives: [
        { type: 'goto', label: 'Infiltrate the Black Sun server vault', x: 1200, y: 900, radius: 60 },
        { type: 'takeout', label: 'Clear 5 VPD tactical units', count: 5, done: 0 },
        { type: 'goto', label: 'Secure Mira at the roof extraction', x: 980, y: 220, radius: 55 },
        { type: 'deliver', label: 'Escape Vireo with the Black Sun archive', x: 2300, y: 850, radius: 65 }
      ]
    }
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  var state = {
    currentIndex: 0,       // which mission is active (index in MISSION_LIST)
    objectiveIndex: 0,     // which sub-objective is current
    objectiveDone: [],     // array of booleans per objective
    active: false,
    complete: false,
    dialog: null,          // { title, text, timer } while briefing dialog is open
    banner: null,          // { title, reward, timer } mission-complete banner
    takeoutCount: 0,       // tracks kills for 'takeout' objectives
    hasVehicleType: false,  // tracks steal_vehicle objective
    chaseSeconds: 0
  };

  // ── Helper: active mission def ─────────────────────────────────────────────
  function getCurrentMission() {
    return MISSION_LIST[state.currentIndex] || null;
  }

  function getObjective() {
    var m = getCurrentMission();
    if (!m) return null;
    return m.objectives[state.objectiveIndex] || null;
  }

  // ── API ────────────────────────────────────────────────────────────────────
  var Missions = {
    state: state,
    list: MISSION_LIST,

    getMission: getCurrentMission,
    getCurrentMission: getCurrentMission,
    getObjective: getObjective,

    // Start the next mission (or current if not started)
    startCurrent: function() {
      var m = getCurrentMission();
      if (!m) return;
      if (m.id === 'black_sun' && (!state.completedIds || !state.completedIds.ghost_convoy)) {
        state.currentIndex = 6;
        m = getCurrentMission();
      }
      state.active = true;
      state.objectiveIndex = 0;
      state.objectiveDone = m.objectives.map(function() { return false; });
      state.takeoutCount = 0;
      state.hasVehicleType = false;
      state.chaseSeconds = 0;
      state.dialog = { title: m.title, text: m.briefing, timer: 6.5 };
      if (VC.Audio) VC.Audio.uiBlip(700);
    },

    closeBriefingDialog: function() {
      state.dialog = null;
    },

    // Advance to next sub-objective
    advanceObjective: function() {
      var m = getCurrentMission();
      if (!m) return;
      state.objectiveDone[state.objectiveIndex] = true;
      state.objectiveIndex++;
      if (VC.hud) VC.hud.setObjectiveProgress('');
      if (state.objectiveIndex >= m.objectives.length) {
        this.completeMission();
      } else {
        if (VC.Audio) VC.Audio.uiBlip(1100);
        if (VC.hud) VC.hud.toast('OBJECTIVE COMPLETE', 1.5);
      }
    },

    completeMission: function() {
      var m = getCurrentMission();
      if (!m) return;
      state.active = false;
      state.banner = { title: m.title, reward: m.reward, timer: 5.0 };
      if (VC.player) VC.player.addCash(m.reward);
      if (VC.Audio) VC.Audio.uiBlip(1400);
      if (VC.hud) VC.hud.toast('MISSION COMPLETE — +$' + m.reward, 4.0);
      // Advance and enforce the Ghost Convoy -> Black Sun prerequisite chain.
      if (m.id === 'ghost_convoy') {
        state.currentIndex = 7;
      } else {
        state.currentIndex = Math.min(state.currentIndex + 1, MISSION_LIST.length - 1);
      }
      state.objectiveIndex = 0;
      state.completedIds = state.completedIds || {};
      state.completedIds[m.id] = true;
    },

    interrupt: function(reason) {
      if (!state.active) return;
      state.active = false;
      state.chaseSeconds = 0;
      if (VC.hud) VC.hud.toast('MISSION INTERRUPTED // ' + (reason || 'OBJECTIVE LOST'), 3.0);
    },

    // Called when player kills an enemy (foot officer / rival)
    registerKill: function() {
      if (!state.active) return;
      var obj = getObjective();
      if (!obj || obj.type !== 'takeout') return;
      state.takeoutCount++;
      if (VC.hud) VC.hud.toast('TARGETS: ' + state.takeoutCount + ' / ' + obj.count, 1.2);
      if (state.takeoutCount >= obj.count) {
        this.advanceObjective();
      }
    },

    // Called by player.js when entering a vehicle
    registerVehicleJack: function(vehicleType) {
      if (!state.active) return;
      var obj = getObjective();
      if (!obj || obj.type !== 'steal_vehicle') return;
      if (obj.vehicleType && obj.vehicleType !== vehicleType) return;
      state.hasVehicleType = true;
      this.advanceObjective();
    },

    update: function(dt, player) {
      // Tick dialog
      if (state.dialog) {
        state.dialog.timer -= dt;
        if (state.dialog.timer <= 0) state.dialog = null;
      }
      // Tick banner
      if (state.banner) {
        state.banner.timer -= dt;
        if (state.banner.timer <= 0) state.banner = null;
      }

      if (!state.active || !player) return;
      if (player.health <= 0) {
        this.interrupt('PLAYER DOWN');
        return;
      }

      var obj = getObjective();
      if (!obj) return;

      // ── goto / deliver ────────────────────────────────────────────────────
      if (obj.type === 'goto' || obj.type === 'deliver') {
        var dx = player.x - obj.x;
        var dy = player.y - obj.y;
        if (Math.sqrt(dx * dx + dy * dy) < obj.radius) {
          this.advanceObjective();
        }
      }

      // ── lose_wanted ───────────────────────────────────────────────────────
      if (obj.type === 'lose_wanted') {
        var lvl = VC.wanted ? VC.wanted.level : player.wantedLevel;
        if (lvl === 0) {
          this.advanceObjective();
        }
      }

      // ── steal_vehicle — handled by registerVehicleJack ───────────────────

      // ── takeout — handled by registerKill ────────────────────────────────
      if (obj.type === 'survive_chase') {
        state.chaseSeconds += dt;
        var secsLeft = Math.max(0, Math.ceil(obj.seconds - state.chaseSeconds));
        if (VC.hud) VC.hud.setObjectiveProgress('ESCORT ' + secsLeft + 's');
        if (state.chaseSeconds >= obj.seconds) {
          this.advanceObjective();
        }
      }
    },

    // Render mission marker ring in world-space
    renderWorldMarker: function(ctx, timeSec) {
      if (!state.active) return;
      var obj = getObjective();
      if (!obj || obj.x === undefined) return;
      var mx = obj.x;
      var my = obj.y;
      var pulse = 1 + 0.18 * Math.sin((timeSec || 0) * 3.5);

      ctx.save();
      ctx.translate(mx, my);

      // Outer ring pulse
      ctx.strokeStyle = 'rgba(255,180,0,0.85)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, 28 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring static
      ctx.strokeStyle = 'rgba(255,220,80,0.6)';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();

      // Centre fill
      ctx.fillStyle = 'rgba(255,180,0,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    },

    // Serialise for save/load
    toSaveData: function() {
      return {
        currentIndex: state.currentIndex,
        objectiveIndex: state.objectiveIndex,
        active: state.active,
        takeoutCount: state.takeoutCount
      };
    },

    fromSaveData: function(d) {
      if (!d) return;
      state.currentIndex   = typeof d.currentIndex   === 'number' ? d.currentIndex   : 0;
      state.objectiveIndex = typeof d.objectiveIndex === 'number' ? d.objectiveIndex : 0;
      state.active         = !!d.active;
      state.takeoutCount   = typeof d.takeoutCount   === 'number' ? d.takeoutCount   : 0;
      var m = getCurrentMission();
      state.objectiveDone  = m ? m.objectives.map(function(_, i) { return i < state.objectiveIndex; }) : [];
    }
  };

  VC.Missions = Missions;
})();
