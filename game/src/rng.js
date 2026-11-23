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
  VC.RNG = new Mulberry32(1986);
  VC.Mulberry32 = Mulberry32;
})();
