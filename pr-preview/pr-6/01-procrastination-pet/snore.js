// A soft snore, synthesized with the Web Audio API (no audio files, nothing external).
// Usage: PetSnore.enable() from a click (browsers only allow audio after a gesture),
// then PetSnore.setActive(true/false) whenever the pet should or shouldn't snore.
window.PetSnore = (function () {
  "use strict";

  const BREATH_CYCLE_MS = 4200; // one inhale-snore + exhale + pause
  const PEAK_VOLUME = 0.12;
  const SILENT = 0.0001;        // exponential ramps can't reach 0

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  let context = null;
  let output = null;
  let filter = null;
  let breathTimer = 0;
  let active = false;

  // Brown noise: soft, low rumble that a resonant filter turns into a snore.
  function createNoiseBuffer(audioContext) {
    const length = audioContext.sampleRate * 2;
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  function build() {
    context = new AudioContextClass();

    const noise = context.createBufferSource();
    noise.buffer = createNoiseBuffer(context);
    noise.loop = true;

    // A low buzz underneath, for the "zzz" in the snore.
    const buzz = context.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 62;
    const buzzLevel = context.createGain();
    buzzLevel.gain.value = 0.25;

    filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 6;
    filter.frequency.value = 220;

    output = context.createGain();
    output.gain.value = SILENT;

    noise.connect(filter);
    buzz.connect(buzzLevel).connect(filter);
    filter.connect(output).connect(context.destination);
    noise.start();
    buzz.start();
  }

  function breathe() {
    const now = context.currentTime;
    const gain = output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(SILENT, now);
    gain.exponentialRampToValueAtTime(PEAK_VOLUME, now + 1.4);   // the snore
    gain.exponentialRampToValueAtTime(PEAK_VOLUME * 0.3, now + 2.0);
    gain.exponentialRampToValueAtTime(SILENT, now + 3.0);       // the exhale

    filter.frequency.cancelScheduledValues(now);
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.linearRampToValueAtTime(360, now + 1.4);
    filter.frequency.linearRampToValueAtTime(260, now + 3.0);
  }

  function hush() {
    const now = context.currentTime;
    output.gain.cancelScheduledValues(now);
    output.gain.setValueAtTime(Math.max(output.gain.value, SILENT), now);
    output.gain.exponentialRampToValueAtTime(SILENT, now + 0.3);
  }

  return {
    isSupported: Boolean(AudioContextClass),

    // Call from a user gesture. Returns false if audio isn't available.
    enable() {
      if (!AudioContextClass) return false;
      try {
        if (!context) build();
        if (context.state === "suspended") context.resume();
        return true;
      } catch (error) {
        return false;
      }
    },

    setActive(shouldSnore) {
      if (!context || shouldSnore === active) return;
      active = shouldSnore;
      window.clearInterval(breathTimer);
      if (active) {
        breathe();
        breathTimer = window.setInterval(breathe, BREATH_CYCLE_MS);
      } else {
        hush();
      }
    },
  };
})();
