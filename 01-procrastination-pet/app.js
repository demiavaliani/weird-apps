// Procrastination Pet: grows while you do nothing, sulks when you do something.
(function () {
  "use strict";

  // ---------- tuning ----------

  const STORAGE_KEY = "procrastination-pet:v1";
  const TICK_MS = 250;
  const SAVE_EVERY_MS = 2000;
  const SULK_MS = 4000;            // how long a sulk lasts after the last disturbance
  const FIDGET_PENALTY_S = 2;      // growth lost per disturbance while already sulking
  const SIDE_EYE_MS = 1200;
  const DISTURB_COOLDOWN_MS = 400; // one scroll gesture fires many events; count it once
  const WELCOME_BACK_MIN_S = 60;   // time away needed for a welcome-back note
  const MAX_AWAY_S = 30 * 24 * 3600;
  const NOTE_MS = 3500;
  const WELCOME_NOTE_MS = 7000;

  // Growth is measured in seconds of doing nothing.
  const STAGES = [
    { name: "Speck", at: 0, caption: "Barely a pet. Mostly potential." },
    { name: "Bean", at: 20, caption: "Look at me. Not doing anything. Thriving." },
    { name: "Blob", at: 60, caption: "Your stillness nourishes me." },
    { name: "Chonk", at: 180, caption: "I have a second chin now. Keep ignoring me." },
    { name: "Absolute Unit", at: 480, caption: "Doctors are concerned. I am not." },
    { name: "Small Moon", at: 1200, caption: "I have my own gravity. Please continue doing nothing." },
    { name: "Local Landmark", at: 3600, caption: "Tourists visit me now. You did this by doing nothing." },
    { name: "Weather System", at: 21600, caption: "I am visible from space. Proud of you, I guess." },
  ];

  const NOTES = {
    key: [
      "oh. we're typing now.",
      "who are you even writing to.",
      "every keystroke echoes in my tiny heart.",
      "put the keyboard down and back away slowly.",
    ],
    click: [
      "oh. we're clicking now.",
      "I felt that.",
      "that click was loud and unnecessary.",
      "was that for me? don't.",
    ],
    scroll: [
      "scrolling? there's nothing down there.",
      "stop rearranging the furniture.",
      "the page is fine where it is.",
    ],
    fidget: [
      "you're doing this on purpose.",
      "I'm shrinking. are you happy?",
      "wow. okay. wow.",
    ],
    shrank: ["I shrank. I hope it was worth it."],
    restart: ["a new speck appears. it's already disappointed in you."],
  };

  // ---------- elements ----------

  const body = document.body;
  const petEl = document.getElementById("pet");
  const petLabel = document.getElementById("pet-label");
  const stageNameEl = document.getElementById("stage-name");
  const captionEl = document.getElementById("caption");
  const noteEl = document.getElementById("note");
  const growthBar = document.getElementById("growth-bar");
  const growthFill = document.getElementById("growth-fill");
  const growthLabel = document.getElementById("growth-label");
  const growthDetail = document.getElementById("growth-detail");
  const startOverButton = document.getElementById("start-over");

  // ---------- storage (optional: the pet works without it) ----------

  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const growth = Number(data.growth);
      const lastSeen = Number(data.lastSeen);
      if (!Number.isFinite(growth) || growth < 0 || !Number.isFinite(lastSeen)) return null;
      return { growth, lastSeen };
    } catch (error) {
      return null;
    }
  }

  function save() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ growth: state.growth, lastSeen: Date.now() }),
      );
    } catch (error) {
      // Storage is blocked or full: the pet just won't remember you.
    }
  }

  // ---------- state ----------

  const state = {
    growth: 0,              // seconds of idleness, ever
    sulkUntil: 0,           // timestamp (ms) when the current sulk ends
    lastTick: Date.now(),
    lastSave: 0,
    lastDisturb: 0,
    stageIndex: 0,
  };

  // ---------- helpers ----------

  function stageIndexFor(growth) {
    let index = 0;
    STAGES.forEach((stage, i) => {
      if (growth >= stage.at) index = i;
    });
    return index;
  }

  // Grows fast at first, then slower, up to 1.3x (sized to fit the scene in CSS).
  function scaleFor(growth) {
    return 0.35 + 0.95 * (1 - Math.exp(-growth / 600));
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const units = [
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
      ["second", 1],
    ];
    const parts = [];
    let rest = seconds;
    for (const [name, size] of units) {
      const amount = Math.floor(rest / size);
      if (amount > 0) {
        parts.push(`${amount} ${name}${amount === 1 ? "" : "s"}`);
        rest -= amount * size;
      }
      if (parts.length === 2) break;
    }
    return parts.length ? parts.join(" ") : "0 seconds";
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function isSulking(now) {
    return now < state.sulkUntil;
  }

  // ---------- rendering ----------

  let noteTimer = 0;

  function showNote(text, duration) {
    window.clearTimeout(noteTimer);
    noteEl.textContent = text;
    noteEl.hidden = false;
    noteTimer = window.setTimeout(() => {
      noteEl.hidden = true;
    }, duration || NOTE_MS);
  }

  function renderStage(index, announce) {
    const stage = STAGES[index];
    stageNameEl.textContent = stage.name;
    captionEl.textContent = stage.caption;
    if (announce) {
      stageNameEl.classList.remove("is-new");
      void stageNameEl.offsetWidth; // restart the pop animation
      stageNameEl.classList.add("is-new");
    }
  }

  function render(now) {
    const sulking = isSulking(now);
    const index = stageIndexFor(state.growth);
    if (index !== state.stageIndex) {
      const shrank = index < state.stageIndex;
      state.stageIndex = index;
      renderStage(index, true);
      if (shrank) showNote(pick(NOTES.shrank));
    }

    const stage = STAGES[index];
    const next = STAGES[index + 1];

    petEl.style.setProperty("--pet-scale", scaleFor(state.growth).toFixed(3));
    petEl.classList.toggle("is-sulking", sulking);
    body.classList.toggle("is-sulking", sulking);
    petLabel.textContent = sulking
      ? `Your pet, a ${stage.name.toLowerCase()}, sulking with its back to you under a tiny rain cloud.`
      : `Your pet, a ${stage.name.toLowerCase()}, looking pleased with you.`;

    if (next) {
      const progress = (state.growth - stage.at) / (next.at - stage.at);
      const percent = Math.min(100, Math.max(0, Math.floor(progress * 100)));
      growthFill.style.width = `${percent}%`;
      growthBar.setAttribute("aria-valuenow", String(percent));
      growthLabel.textContent = `Next size: ${next.name}`;
      growthDetail.textContent = sulking
        ? "Growth paused. It's sulking."
        : `Do nothing for ${formatDuration(next.at - state.growth)}.`;
    } else {
      growthFill.style.width = "100%";
      growthBar.setAttribute("aria-valuenow", "100");
      growthLabel.textContent = "Final form";
      growthDetail.textContent = sulking
        ? "Even final forms sulk."
        : "There is nowhere left to grow. Keep doing nothing anyway.";
    }
  }

  // ---------- the loop ----------

  // Wall-clock based, so time in a background tab still counts.
  function tick() {
    const now = Date.now();
    const elapsed = Math.max(0, (now - state.lastTick) / 1000);
    state.lastTick = now;
    if (!isSulking(now)) state.growth += Math.min(elapsed, MAX_AWAY_S);

    render(now);

    if (now - state.lastSave >= SAVE_EVERY_MS) {
      state.lastSave = now;
      save();
    }
  }

  // ---------- disturbances ----------

  function disturb(kind) {
    const now = Date.now();
    if (now - state.lastDisturb < DISTURB_COOLDOWN_MS) {
      state.sulkUntil = now + SULK_MS; // still sulking, no extra penalty
      return;
    }
    state.lastDisturb = now;
    tick(); // bank growth up to this moment first

    if (isSulking(now)) {
      state.growth = Math.max(0, state.growth - FIDGET_PENALTY_S);
      if (Math.random() < 0.35) showNote(pick(NOTES.fidget));
    } else {
      showNote(pick(NOTES[kind]));
    }
    state.sulkUntil = now + SULK_MS;
    render(now);
  }

  let sideEyeTimer = 0;

  function sideEye(event) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const rect = petEl.getBoundingClientRect();
    const look = event.clientX < rect.left + rect.width / 2 ? -5 : 5;
    petEl.style.setProperty("--look", `${look}px`);
    petEl.classList.add("is-side-eye");
    window.clearTimeout(sideEyeTimer);
    sideEyeTimer = window.setTimeout(() => {
      petEl.classList.remove("is-side-eye");
      petEl.style.setProperty("--look", "0px");
    }, SIDE_EYE_MS);
  }

  const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

  function onKey(event) {
    if (event.repeat || MODIFIER_KEYS.has(event.key)) return;
    disturb("key");
  }

  function startOver(event) {
    event.stopPropagation(); // starting over isn't an insult
    state.growth = 0;
    state.sulkUntil = 0;
    state.stageIndex = 0;
    renderStage(0, true);
    save();
    render(Date.now());
    showNote(NOTES.restart[0], WELCOME_NOTE_MS);
  }

  // ---------- start ----------

  function welcomeBack(awaySeconds, stagesGained) {
    const grew =
      stagesGained === 0
        ? "I grew a little"
        : `I grew ${stagesGained} size${stagesGained === 1 ? "" : "s"}`;
    showNote(
      `You were gone ${formatDuration(awaySeconds)}. ${grew}. Thank you for nothing.`,
      WELCOME_NOTE_MS,
    );
  }

  function init() {
    const saved = loadSaved();
    if (saved) {
      const away = Math.min(MAX_AWAY_S, Math.max(0, (Date.now() - saved.lastSeen) / 1000));
      const before = stageIndexFor(saved.growth);
      state.growth = saved.growth + away;
      if (away >= WELCOME_BACK_MIN_S) {
        welcomeBack(away, stageIndexFor(state.growth) - before);
      }
    }

    state.stageIndex = stageIndexFor(state.growth);
    state.lastTick = Date.now();
    renderStage(state.stageIndex, false);
    render(Date.now());

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", (event) => {
      if (event.target === startOverButton) return;
      disturb("click");
    });
    window.addEventListener("wheel", () => disturb("scroll"), { passive: true });
    window.addEventListener("touchmove", () => disturb("scroll"), { passive: true });
    window.addEventListener("pointermove", sideEye);
    startOverButton.addEventListener("click", startOver);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
      else tick();
    });
    window.addEventListener("pagehide", save);

    window.setInterval(tick, TICK_MS);
  }

  init();
})();
