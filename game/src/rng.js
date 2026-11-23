// Mulberry32 seeded pseudo-random number generator and deterministic math helpers
(function() {
  'use strict';

  var VC = window.VC = window.VC || {};

  function Mulberry32(seed) {
    this._initial = (seed >>> 0) || 1337;
    this._state = this._initial;
  }

  Mulberry32.prototype.seed = function(s) {
    this._initial = (s >>> 0) || 1337;
    this._state = this._initial;
  };

  Mulberry32.prototype.next = function() {
    var t = (this._state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  Mulberry32.prototype.random = function() {
    return this.next();
  };

  Mulberry32.prototype.randFloat = function(min, max) {
    return min + this.next() * (max - min);
  };

  Mulberry32.prototype.randInt = function(min, max) {
    return Math.floor(min + this.next() * (max - min + 1));
  };

  Mulberry32.prototype.randChoice = function(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(this.next() * arr.length)];
  };

  Mulberry32.prototype.randBool = function(chance) {
    if (chance === undefined) chance = 0.5;
    return this.next() < chance;
  };

  Mulberry32.prototype.fork = function(extraSeed) {
    var childSeed = Math.floor(this.next() * 0xFFFFFFFF) ^ ((extraSeed || 0) >>> 0);
    return new Mulberry32(childSeed);
  };

  // Default global RNG instance
  // Named streams keep subsystem sequences independent while remaining seed-reproducible.
  var streams = {};
  var baseSeed = 1986;
  function hashName(name) {
    var h = 2166136261;
    var text = String(name || 'global');
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h ^ baseSeed ^ Math.imul(baseSeed, 31)) >>> 0;
  }
  function setBaseSeed(seed) {
    baseSeed = (seed >>> 0) || 1986;
    streams = {};
    VC.RNG.seed(baseSeed);
  }
  VC.RNG = new Mulberry32(baseSeed);
  VC.RNG.stream = function(name) {
    var key = String(name || 'default');
    if (!streams[key]) streams[key] = new Mulberry32(hashName(key));
    return streams[key];
  };
  VC.RNG.setSeed = setBaseSeed;
  VC.Mulberry32 = Mulberry32;
})();
