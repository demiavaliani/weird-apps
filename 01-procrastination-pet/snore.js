// The pet's snore: a short loop of a real toddler snoring (snore.mp3, stored in this
// folder, nothing loaded from elsewhere).
//
// Sound: "Snoring child #1" by Joseph Sardin, BigSoundBank.com
//   https://bigsoundbank.com/snoring-child-s1070.html
//   License: CC0 1.0 (public domain). Trimmed to five breaths and loudness-normalized.
//
// Usage: PetSnore.enable() from a click (browsers only allow audio after a gesture),
// then PetSnore.setActive(true/false) whenever the pet should or shouldn't snore.
window.PetSnore = (function () {
  "use strict";

  const SOUND_URL = "snore.mp3";
  const VOLUME = 0.7;
  const FADE_MS = 400;
  const FADE_STEPS = 10;

  const isSupported = typeof window.Audio === "function";

  let audio = null;
  let broken = false;
  let active = false;
  let fadeTimer = 0;

  function fadeTo(target, onDone) {
    window.clearInterval(fadeTimer);
    const start = audio.volume;
    let step = 0;
    fadeTimer = window.setInterval(() => {
      step += 1;
      audio.volume = start + ((target - start) * step) / FADE_STEPS;
      if (step >= FADE_STEPS) {
        window.clearInterval(fadeTimer);
        if (onDone) onDone();
      }
    }, FADE_MS / FADE_STEPS);
  }

  function play() {
    const result = audio.play();
    // play() returns a promise in modern browsers; a rejection (blocked autoplay)
    // just means no sound.
    if (result && typeof result.catch === "function") result.catch(() => {});
  }

  return {
    isSupported,

    // Call from a user gesture. Returns false if audio isn't available.
    enable() {
      if (!isSupported || broken) return false;
      if (!audio) {
        audio = new Audio(SOUND_URL);
        audio.loop = true;
        audio.preload = "auto";
        audio.volume = 0;
        audio.addEventListener("error", () => {
          broken = true;
          active = false;
        });
        // Start and immediately pause inside the gesture, so later play() calls
        // (when the pet grows big enough) are allowed.
        play();
        if (!active) audio.pause();
      }
      return true;
    },

    setActive(shouldSnore) {
      if (!audio || broken || shouldSnore === active) return;
      active = shouldSnore;
      if (active) {
        audio.volume = 0;
        play();
        fadeTo(VOLUME);
      } else {
        fadeTo(0, () => audio.pause());
      }
    },
  };
})();
