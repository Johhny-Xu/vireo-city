// WebAudio procedural sound synthesizer for Vireo City
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  var audioCtx = null;
  var musicPlaying = false;
  var musicTimer = null;
  var sirenOsc = null;
  var sirenGain = null;
  var sirenTimer = null;
  var engineOsc = null;
  var engineGain = null;
  var helicopterOsc = null;
  var helicopterGain = null;
  var rainOsc = null, rainGain = null, heartbeatTimer = null;
  // Audio comment: synthesized rain and heartbeat layers give weather and low-health state immediate feedback offline.

  function getAudioContext() {
    if (!audioCtx) {
      try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      } catch (e) {
        audioCtx = null;
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try {
        audioCtx.resume();
      } catch (e) {}
    }
    return audioCtx;
  }

  function createNoiseBuffer(durationSec) {
    var ctx = getAudioContext();
    if (!ctx) return null;
    var sampleRate = ctx.sampleRate;
    var frameCount = sampleRate * (durationSec || 0.5);
    var buffer = ctx.createBuffer(1, frameCount, sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  var Audio = {
    enabled: true,

    explosion: function() {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var noiseBuf = createNoiseBuffer(0.9);
        if (noiseBuf) {
          var source = ctx.createBufferSource();
          source.buffer = noiseBuf;
          var filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(900, now);
          filter.frequency.exponentialRampToValueAtTime(55, now + 0.75);
          var gain = ctx.createGain();
          gain.gain.setValueAtTime(0.48, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
          source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
          source.start(now); source.stop(now + 0.9);
        }
        var osc = ctx.createOscillator();
        var og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.8);
        og.gain.setValueAtTime(0.55, now);
        og.gain.exponentialRampToValueAtTime(0.001, now + 0.82);
        osc.connect(og); og.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.82);
      } catch (e) {}
    },

    init: function() {
      getAudioContext();
      this.setRainIntensity(0.45);
    },

    setRainIntensity: function(intensity) {
      var ctx = getAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      if (!rainOsc) {
        rainOsc = ctx.createOscillator();
        rainGain = ctx.createGain();
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1300;
        rainOsc.type = 'sawtooth';
        rainOsc.frequency.value = 55;
        rainGain.gain.value = 0.0001;
        rainOsc.connect(filter); filter.connect(rainGain); rainGain.connect(ctx.destination);
        rainOsc.start();
      }
      rainGain.gain.linearRampToValueAtTime(0.025 + Math.max(0, intensity) * 0.055, now + 0.18);
    },

    setHeartbeat: function(active) {
      if (heartbeatTimer && !active) {
        clearInterval(heartbeatTimer); heartbeatTimer = null;
      }
      if (!active || heartbeatTimer) return;
      heartbeatTimer = setInterval(function() {
        var ctx = getAudioContext();
        if (!ctx || !VC.player) return;
        try {
          var now = ctx.currentTime;
          var osc = ctx.createOscillator();
          var gain = ctx.createGain();
          osc.type = 'sine'; osc.frequency.setValueAtTime(72, now);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(now); osc.stop(now + 0.1);
        } catch (e) {}
      }, 820);
    },

    uiBlip: function(freq) {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq || 980, now);
        osc.frequency.exponentialRampToValueAtTime((freq || 980) * 1.5, now + 0.06);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
      } catch (e) {}
    },

    footstep: function() {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.04);

        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.045);
      } catch (e) {}
    },

    gunshot: function() {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;

        // Noise crack
        var noiseBuf = createNoiseBuffer(0.25);
        if (noiseBuf) {
          var noiseSource = ctx.createBufferSource();
          noiseSource.buffer = noiseBuf;

          var filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1200, now);
          filter.frequency.exponentialRampToValueAtTime(200, now + 0.2);
          filter.Q.value = 1.2;

          var noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.35, now);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

          noiseSource.connect(filter);
          filter.connect(noiseGain);
          noiseGain.connect(ctx.destination);

          noiseSource.start(now);
          noiseSource.stop(now + 0.25);
        }

        // Sub thump
        var thumpOsc = ctx.createOscillator();
        var thumpGain = ctx.createGain();
        thumpOsc.type = 'sine';
        thumpOsc.frequency.setValueAtTime(140, now);
        thumpOsc.frequency.exponentialRampToValueAtTime(35, now + 0.28);

        thumpGain.gain.setValueAtTime(0.4, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        thumpOsc.connect(thumpGain);
        thumpGain.connect(ctx.destination);

        thumpOsc.start(now);
        thumpOsc.stop(now + 0.3);
      } catch (e) {}
    },

    shotgunSound: function() {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var noiseBuf = createNoiseBuffer(0.42);
        if (noiseBuf) {
          var source = ctx.createBufferSource();
          source.buffer = noiseBuf;
          var filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 700;
          var gain = ctx.createGain();
          gain.gain.setValueAtTime(0.52, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
          source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
          source.start(now); source.stop(now + 0.42);
        }
      } catch (e) {}
    },

    sniperSound: function() {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
        gain.gain.setValueAtTime(0.48, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.58);
      } catch (e) {}
    },

    punchSound: function() {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.12);
      } catch (e) {}
    },

    thunder: function() {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        var noiseBuf = createNoiseBuffer(1.8);
        if (!noiseBuf) return;
        var source = ctx.createBufferSource();
        source.buffer = noiseBuf;
        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(180, now);
        filter.frequency.exponentialRampToValueAtTime(45, now + 1.5);
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(0.42, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(now);
        source.stop(now + 1.8);
      } catch (e) {}
    },

    startSiren: function() {
      if (!this.enabled || sirenOsc) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'sawtooth';

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;

        sirenOsc.frequency.setValueAtTime(620, now);
        sirenGain.gain.setValueAtTime(0.08, now);

        sirenOsc.connect(filter);
        filter.connect(sirenGain);
        sirenGain.connect(ctx.destination);
        sirenOsc.start(now);

        var high = false;
        sirenTimer = setInterval(function() {
          if (!audioCtx || !sirenOsc) return;
          var t = audioCtx.currentTime;
          high = !high;
          sirenOsc.frequency.cancelScheduledValues(t);
          sirenOsc.frequency.linearRampToValueAtTime(high ? 860 : 620, t + 0.35);
        }, 400);
      } catch (e) {}
    },

    stopSiren: function() {
      if (sirenTimer) {
        clearInterval(sirenTimer);
        sirenTimer = null;
      }
      if (sirenOsc) {
        try {
          sirenOsc.stop();
          sirenOsc.disconnect();
        } catch (e) {}
        sirenOsc = null;
      }
      sirenGain = null;
    },

    setHelicopterHum: function(active, speedNorm) {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      if (active && !helicopterOsc) {
        helicopterOsc = ctx.createOscillator();
        helicopterGain = ctx.createGain();
        helicopterOsc.type = 'sawtooth';
        helicopterOsc.frequency.setValueAtTime(38, now);
        helicopterGain.gain.setValueAtTime(0.018, now);
        helicopterOsc.connect(helicopterGain);
        helicopterGain.connect(ctx.destination);
        helicopterOsc.start(now);
      } else if (!active && helicopterOsc) {
        helicopterGain.gain.linearRampToValueAtTime(0.0001, now + 0.12);
        var oldOsc = helicopterOsc;
        var oldGain = helicopterGain;
        setTimeout(function() {
          try { oldOsc.stop(); oldOsc.disconnect(); oldGain.disconnect(); } catch (e) {}
        }, 140);
        helicopterOsc = null;
        helicopterGain = null;
      } else if (active && helicopterOsc) {
        var target = 38 + (speedNorm || 0) * 34;
        helicopterOsc.frequency.cancelScheduledValues(now);
        helicopterOsc.frequency.linearRampToValueAtTime(target, now + 0.12);
        helicopterGain.gain.cancelScheduledValues(now);
        helicopterGain.gain.linearRampToValueAtTime(0.018 + (speedNorm || 0) * 0.018, now + 0.12);
      }
    },

    setEngineHum: function(speedNorm) {
      if (!this.enabled) return;
      var ctx = getAudioContext();
      if (!ctx) return;
      try {
        var now = ctx.currentTime;
        if (!engineOsc && speedNorm > 0.05) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'triangle';
          engineOsc.frequency.setValueAtTime(45, now);
          engineGain.gain.setValueAtTime(0.02, now);
          engineOsc.connect(engineGain);
          engineGain.connect(ctx.destination);
          engineOsc.start(now);
        } else if (engineOsc) {
          if (speedNorm <= 0.02) {
            engineGain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
            setTimeout(function() {
              if (engineOsc && speedNorm <= 0.02) {
                try { engineOsc.stop(); engineOsc.disconnect(); } catch (e) {}
                engineOsc = null;
                engineGain = null;
              }
            }, 120);
          } else {
            var targetFreq = 42 + speedNorm * 85;
            var targetVol = 0.02 + speedNorm * 0.07;
            engineOsc.frequency.cancelScheduledValues(now);
            engineOsc.frequency.linearRampToValueAtTime(targetFreq, now + 0.1);
            engineGain.gain.cancelScheduledValues(now);
            engineGain.gain.linearRampToValueAtTime(targetVol, now + 0.1);
          }
        }
      } catch (e) {}
    },

    toggleMusic: function() {
      if (musicPlaying) {
        this.stopMusic();
        return false;
      } else {
        this.startMusic();
        return true;
      }
    },

    startMusic: function() {
      var ctx = getAudioContext();
      if (!ctx || musicPlaying) return;
      musicPlaying = true;

      // Minor synth arpeggio notes in Hz (Dm9: D3, F3, A3, C4, E4)
      var chords = [
        [146.83, 174.61, 220.00, 261.63, 329.63], // Dm9
        [116.54, 146.83, 174.61, 233.08, 293.66], // Bbmaj7
        [130.81, 164.81, 196.00, 261.63, 329.63], // C7
        [110.00, 146.83, 174.61, 220.00, 261.63]  // Am7
      ];

      var chordIdx = 0;
      var noteIdx = 0;
      var step = 0;

      function playNote() {
        if (!musicPlaying) return;
        var actx = getAudioContext();
        if (!actx) return;
        try {
          var t = actx.currentTime;
          var curChord = chords[chordIdx];
          var freq = curChord[noteIdx % curChord.length];

          var osc = actx.createOscillator();
          var filter = actx.createBiquadFilter();
          var gain = actx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800 + (step % 4) * 200, t);
          filter.frequency.exponentialRampToValueAtTime(250, t + 0.35);

          gain.gain.setValueAtTime(0.035, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(actx.destination);

          osc.start(t);
          osc.stop(t + 0.42);

          // Sub bass on downbeats
          if (step % 8 === 0) {
            var bassOsc = actx.createOscillator();
            var bassGain = actx.createGain();
            bassOsc.type = 'sine';
            bassOsc.frequency.setValueAtTime(curChord[0] / 2, t);
            bassGain.gain.setValueAtTime(0.08, t);
            bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            bassOsc.connect(bassGain);
            bassGain.connect(actx.destination);
            bassOsc.start(t);
            bassOsc.stop(t + 0.85);
          }

          step++;
          noteIdx = (noteIdx + 1) % curChord.length;
          if (step % 16 === 0) {
            chordIdx = (chordIdx + 1) % chords.length;
          }
        } catch (e) {}
      }

      musicTimer = setInterval(playNote, 160);
    },

    stopMusic: function() {
      musicPlaying = false;
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },

    isMusicPlaying: function() {
      return musicPlaying;
    }
  };

  VC.Audio = Audio;
})();
