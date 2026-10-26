let EXERCISES = [];
let currentWorkout = null;
let currentPlan = null;
let lastParams = null;
let activeWeekIndex = 0;

const state = {
  mode: "quick",
  goal: "general",
  duration: "30",
  difficulty: "beginner",
  weeks: "2",
  daysPerWeek: "4",
  equipment: new Set(["bodyweight"]),
  muscles: new Set()
};

const DIFF_RANK = { beginner: 1, intermediate: 2, advanced: 3 };

fetch("data/exercises.json")
  .then(r => r.json())
  .then(data => { EXERCISES = data; });

// ---------- chip / mode-toggle selection logic ----------
document.querySelectorAll(".chip-group").forEach(group => {
  const field = group.dataset.field;
  const isMulti = group.classList.contains("multi");
  group.addEventListener("click", e => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const value = btn.dataset.value;

    if (isMulti) {
      if (btn.classList.contains("selected")) {
        btn.classList.remove("selected");
        state[field].delete(value);
      } else {
        btn.classList.add("selected");
        state[field].add(value);
      }
    } else {
      group.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
      btn.classList.add("selected");
      state[field] = value;
    }
  });
});

document.querySelector(".mode-toggle").addEventListener("click", e => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  state.mode = btn.dataset.value;
  document.querySelectorAll(".plan-only").forEach(el => el.hidden = state.mode !== "plan");
  document.getElementById("duration-label").textContent = state.mode === "plan" ? "Minutes per day" : "Duration";
  document.getElementById("generate-btn").textContent = state.mode === "plan" ? "Generate Plan" : "Generate Workout";
});

// ---------- tab navigation ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => showTab(btn.dataset.tab));
});
function showTab(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  if (id === "saved-screen") renderSaved();
}

document.getElementById("back-btn").addEventListener("click", () => showTab("setup-screen"));
document.getElementById("plan-back-btn").addEventListener("click", () => showTab("setup-screen"));
document.getElementById("regen-btn").addEventListener("click", () => {
  if (lastParams) renderWorkout(generateWorkout(lastParams));
});

// ---------- form submit ----------
document.getElementById("setup-form").addEventListener("submit", e => {
  e.preventDefault();
  const params = {
    goal: state.goal,
    duration: parseInt(state.duration, 10),
    difficulty: state.difficulty,
    equipment: new Set(state.equipment.size ? state.equipment : ["bodyweight"]),
    muscles: new Set(state.muscles)
  };

  if (state.mode === "plan") {
    const planParams = {
      ...params,
      weeks: parseInt(state.weeks, 10),
      daysPerWeek: parseInt(state.daysPerWeek, 10)
    };
    lastParams = planParams;
    currentPlan = generatePlan(planParams);
    activeWeekIndex = 0;
    renderPlan(currentPlan);
    showTab("plan-screen");
  } else {
    lastParams = params;
    const workout = generateWorkout(params);
    renderWorkout(workout);
    showTab("workout-screen");
  }
});

// ============================================================
// SPLIT TEMPLATES — how training days are organized across a week
// ============================================================
const MUSCLE_GROUPS = {
  Upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  Lower: ["quads", "glutes", "hamstrings"],
  Push: ["chest", "shoulders", "triceps"],
  Pull: ["back", "biceps"],
  Legs: ["quads", "glutes", "hamstrings"],
  "Full Body": null, // no restriction
  "Core & Mobility": ["core", "obliques", "lower back", "spine", "hips"],
  Recovery: null
};

function getSplitTemplate(daysPerWeek) {
  switch (daysPerWeek) {
    case 1: return [{ label: "Full Body", muscles: null }];
    case 2: return [
      { label: "Upper", muscles: MUSCLE_GROUPS.Upper },
      { label: "Lower", muscles: MUSCLE_GROUPS.Lower }
    ];
    case 3: return [
      { label: "Push", muscles: MUSCLE_GROUPS.Push },
      { label: "Pull", muscles: MUSCLE_GROUPS.Pull },
      { label: "Legs", muscles: MUSCLE_GROUPS.Legs }
    ];
    case 4: return [
      { label: "Upper", muscles: MUSCLE_GROUPS.Upper },
      { label: "Lower", muscles: MUSCLE_GROUPS.Lower },
      { label: "Upper", muscles: MUSCLE_GROUPS.Upper },
      { label: "Lower", muscles: MUSCLE_GROUPS.Lower }
    ];
    case 5: return [
      { label: "Push", muscles: MUSCLE_GROUPS.Push },
      { label: "Pull", muscles: MUSCLE_GROUPS.Pull },
      { label: "Legs", muscles: MUSCLE_GROUPS.Legs },
      { label: "Upper", muscles: MUSCLE_GROUPS.Upper },
      { label: "Lower", muscles: MUSCLE_GROUPS.Lower }
    ];
    case 6: return [
      { label: "Push", muscles: MUSCLE_GROUPS.Push },
      { label: "Pull", muscles: MUSCLE_GROUPS.Pull },
      { label: "Legs", muscles: MUSCLE_GROUPS.Legs },
      { label: "Push", muscles: MUSCLE_GROUPS.Push },
      { label: "Pull", muscles: MUSCLE_GROUPS.Pull },
      { label: "Legs", muscles: MUSCLE_GROUPS.Legs }
    ];
    case 7: return [
      { label: "Push", muscles: MUSCLE_GROUPS.Push },
      { label: "Pull", muscles: MUSCLE_GROUPS.Pull },
      { label: "Legs", muscles: MUSCLE_GROUPS.Legs },
      { label: "Upper", muscles: MUSCLE_GROUPS.Upper },
      { label: "Lower", muscles: MUSCLE_GROUPS.Lower },
      { label: "Core & Mobility", muscles: MUSCLE_GROUPS["Core & Mobility"] },
      { label: "Recovery", muscles: null, isRest: true }
    ];
    default: return [{ label: "Full Body", muscles: null }];
  }
}

function goalTypeWeights(goal) {
  switch (goal) {
    case "strength": return { strength: 5, core: 1, cardio: 0, mobility: 1 };
    case "cardio": return { cardio: 5, strength: 1, core: 1, mobility: 0 };
    case "fatloss": return { cardio: 4, strength: 2, core: 2, mobility: 0 };
    case "mobility": return { mobility: 5, core: 1, strength: 0, cardio: 0 };
    default: return { strength: 2, cardio: 2, core: 2, mobility: 1 };
  }
}

function pickUnique(arr, n) {
  const out = [];
  const used = new Set();
  for (const ex of arr) {
    if (used.has(ex.name)) continue;
    used.add(ex.name);
    out.push(ex);
    if (out.length >= n) break;
  }
  return out;
}

function formatSetLabel(ex, seconds) {
  if (ex.type === "strength") {
    const reps = seconds <= 30 ? "10-12 reps" : seconds <= 45 ? "12-15 reps" : "15-20 reps";
    return reps;
  }
  return `${seconds}s`;
}

// ============================================================
// SINGLE-DAY WORKOUT GENERATOR (used by Quick Workout + each plan day)
// ============================================================
function generateWorkout(params, dayFocus) {
  const { goal, duration, difficulty, equipment, muscles } = params;
  const maxDiff = DIFF_RANK[difficulty];

  let pool = EXERCISES.filter(ex =>
    equipment.has(ex.equipment) && DIFF_RANK[ex.difficulty] <= maxDiff
  );
  if (pool.length === 0) pool = EXERCISES.filter(ex => equipment.has(ex.equipment));

  // apply split-day muscle restriction if provided
  const effectiveGoal = (dayFocus && dayFocus.label === "Recovery") ? "mobility" : goal;
  const focusMuscles = dayFocus ? dayFocus.muscles : null;
  if (focusMuscles) {
    const restricted = pool.filter(ex => ex.muscles.some(m => focusMuscles.includes(m)));
    if (restricted.length >= 3) pool = restricted;
  }

  const typeWeights = goalTypeWeights(effectiveGoal);
  const targetMuscles = focusMuscles ? new Set(focusMuscles) : muscles;

  function score(ex) {
    let s = typeWeights[ex.type] ?? 1;
    if (targetMuscles && targetMuscles.size) {
      const hit = ex.muscles.some(m => targetMuscles.has ? targetMuscles.has(m) : targetMuscles.includes(m));
      s += hit ? 4 : 0;
    }
    s += Math.random() * 2;
    return s;
  }

  const ranked = [...pool].sort((a, b) => score(b) - score(a));

  const warmupTime = Math.max(3, Math.round(duration * 0.1));
  const cooldownTime = Math.max(3, Math.round(duration * 0.1));
  const mainTime = duration - warmupTime - cooldownTime;

  const exPerBlock = duration <= 15 ? 4 : duration <= 30 ? 6 : duration <= 45 ? 8 : 10;
  const rounds = effectiveGoal === "mobility" ? 1 : duration <= 20 ? 2 : 3;

  const mainPool = ranked.filter(ex => ex.type !== "mobility");
  const warmupPool = EXERCISES.filter(ex =>
    (ex.type === "mobility" || ex.type === "cardio") && equipment.has(ex.equipment)
  );
  const cooldownPool = EXERCISES.filter(ex => ex.type === "mobility" && equipment.has(ex.equipment));

  const mainExCount = Math.min(exPerBlock, mainPool.length || 1);
  const mainExercises = effectiveGoal === "mobility"
    ? pickUnique(ranked, mainExCount)
    : pickUnique(mainPool.length ? mainPool : ranked, mainExCount);

  const perExerciseSeconds = mainExercises.length
    ? Math.max(20, Math.floor((mainTime * 60) / (mainExercises.length * rounds)))
    : 30;

  const blocks = [];

  const warmupPicks = pickUnique([...warmupPool].sort(() => Math.random() - 0.5), 2);
  if (warmupPicks.length && effectiveGoal !== "mobility") {
    blocks.push({
      section: "Warm-up",
      items: warmupPicks.map(ex => ({ ...ex, durationLabel: `${Math.max(20, Math.round(warmupTime * 60 / warmupPicks.length))}s`, _seconds: Math.max(20, Math.round(warmupTime * 60 / warmupPicks.length)), _role: "warmup", _focus: focusMuscles }))
    });
  }

  if (rounds > 1 && effectiveGoal !== "mobility") {
    blocks.push({
      section: `Main (${rounds} rounds)`,
      items: mainExercises.map(ex => ({ ...ex, durationLabel: formatSetLabel(ex, perExerciseSeconds), _seconds: perExerciseSeconds, _role: "main", _focus: focusMuscles }))
    });
  } else {
    blocks.push({
      section: effectiveGoal === "mobility" ? "Routine" : "Main",
      items: mainExercises.map(ex => ({ ...ex, durationLabel: formatSetLabel(ex, perExerciseSeconds), _seconds: perExerciseSeconds, _role: "main", _focus: focusMuscles }))
    });
  }

  const cooldownPicks = pickUnique([...cooldownPool].sort(() => Math.random() - 0.5), effectiveGoal === "mobility" ? 0 : 2);
  if (cooldownPicks.length) {
    blocks.push({
      section: "Cool-down",
      items: cooldownPicks.map(ex => ({ ...ex, durationLabel: `${Math.max(20, Math.round(cooldownTime * 60 / cooldownPicks.length))}s`, _seconds: Math.max(20, Math.round(cooldownTime * 60 / cooldownPicks.length)), _role: "cooldown", _focus: focusMuscles }))
    });
  }

  return {
    goal, duration, difficulty,
    equipment: [...equipment],
    createdAt: new Date().toISOString(),
    dayLabel: dayFocus ? dayFocus.label : null,
    blocks
  };
}

// ============================================================
// MULTI-WEEK PLAN GENERATOR
// ============================================================
function generatePlan(params) {
  const { weeks, daysPerWeek } = params;
  const template = getSplitTemplate(daysPerWeek);

  const planWeeks = [];
  for (let w = 0; w < weeks; w++) {
    // mild progressive overload: later weeks nudge duration up slightly (capped)
    const progressFactor = 1 + w * 0.08;
    const days = template.map((dayFocus) => {
      if (dayFocus.isRest) {
        return { focus: dayFocus.label, isRest: true, blocks: [] };
      }
      const dayDuration = Math.min(90, Math.round(params.duration * progressFactor));
      const dayParams = { ...params, duration: dayDuration };
      const workout = generateWorkout(dayParams, dayFocus);
      return { focus: dayFocus.label, isRest: false, blocks: workout.blocks, duration: dayDuration };
    });
    planWeeks.push({ weekIndex: w, days });
  }

  return {
    goal: params.goal,
    difficulty: params.difficulty,
    equipment: [...params.equipment],
    weeksCount: weeks,
    daysPerWeek,
    createdAt: new Date().toISOString(),
    weeks: planWeeks
  };
}

// ============================================================
// SWAP LOGIC — replace one exercise with another hitting the same muscles
// ============================================================
function findSwapCandidate(current, equipmentSet, maxDiff, excludeNames) {
  let candidates = EXERCISES.filter(ex =>
    equipmentSet.has(ex.equipment) &&
    DIFF_RANK[ex.difficulty] <= maxDiff &&
    ex.name !== current.name &&
    !excludeNames.has(ex.name) &&
    ex.muscles.some(m => current.muscles.includes(m))
  );
  if (!candidates.length) {
    candidates = EXERCISES.filter(ex =>
      equipmentSet.has(ex.equipment) &&
      DIFF_RANK[ex.difficulty] <= maxDiff &&
      ex.name !== current.name &&
      !excludeNames.has(ex.name) &&
      ex.type === current.type
    );
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ============================================================
// RENDERING — quick workout
// ============================================================
function renderWorkout(workout) {
  currentWorkout = workout;
  const titleMap = { strength: "Strength", cardio: "Cardio", fatloss: "Fat Loss", mobility: "Mobility", general: "General Fitness" };
  document.getElementById("workout-title").textContent =
    `${titleMap[workout.goal]} · ${workout.duration} min`;

  const list = document.getElementById("workout-list");
  list.innerHTML = "";
  renderBlocksInto(list, workout.blocks, lastParams, () => renderWorkout(currentWorkout));
}

function renderBlocksInto(container, blocks, params, onChange) {
  let counter = 1;
  const equipmentSet = params.equipment instanceof Set ? params.equipment : new Set(params.equipment);
  const maxDiff = DIFF_RANK[params.difficulty];

  blocks.forEach(block => {
    const h = document.createElement("div");
    h.className = "card";
    h.innerHTML = `<h2>${block.section}</h2>`;
    block.items.forEach((ex, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "exercise-card-wrap";

      const row = document.createElement("div");
      row.className = "exercise-card" + (exerciseIsLogged(ex) ? " logged" : "");
      row.innerHTML = `
        <div class="num">${ex._done ? "✓" : counter}</div>
        <div class="info">
          <div class="name">${ex.name}</div>
          <div class="meta">${ex.muscles.join(", ")} · ${ex.equipment}</div>
          ${exerciseIsLogged(ex) ? `<div class="log-badge">${exerciseSetSummary(ex)}</div>` : ""}
        </div>
        <div class="dur">${ex.durationLabel}</div>
        <button type="button" class="swap-btn" title="Swap exercise">⇄</button>
      `;
      counter++;
      row.querySelector(".swap-btn").addEventListener("click", e => {
        e.stopPropagation();
        const excludeNames = new Set(block.items.map(i => i.name));
        const alt = findSwapCandidate(ex, equipmentSet, maxDiff, excludeNames);
        if (!alt) return;
        block.items[idx] = { ...alt, durationLabel: formatSetLabel(alt, ex._seconds || 30), _seconds: ex._seconds, _role: ex._role, _focus: ex._focus };
        onChange();
      });

      const panel = document.createElement("div");
      panel.className = "exercise-log-panel";
      panel.hidden = true;

      row.addEventListener("click", () => {
        const isOpen = !panel.hidden;
        wrap.querySelectorAll(".exercise-log-panel").forEach(p => { if (p !== panel) p.hidden = true; });
        if (isOpen) {
          panel.hidden = true;
        } else {
          panel.innerHTML = "";
          panel.appendChild(buildLogPanel(ex, () => { onChange(); }));
          panel.hidden = false;
        }
      });

      wrap.appendChild(row);
      wrap.appendChild(panel);
      h.appendChild(wrap);
    });
    container.appendChild(h);
  });
}

// ---------- per-exercise set logging ----------
function exerciseIsLogged(ex) {
  return !!(ex._log && ex._log.sets && ex._log.sets.some(s => s.done));
}
function exerciseSetSummary(ex) {
  const done = ex._log.sets.filter(s => s.done).length;
  return `${done}/${ex._log.sets.length} sets logged`;
}
function defaultLog() {
  return { sets: [{ reps: "", weight: "", done: false }, { reps: "", weight: "", done: false }, { reps: "", weight: "", done: false }], note: "", restSeconds: 90 };
}

function buildLogPanel(ex, onSave) {
  const log = ex._log ? JSON.parse(JSON.stringify(ex._log)) : defaultLog();

  const panel = document.createElement("div");
  panel.innerHTML = `
    <div class="rest-banner">
      <div class="rest-text"><strong id="rest-time-display">Rest for ${Math.round(log.restSeconds / 60) || 1} min</strong><span>Rest between each set</span></div>
      <button type="button" class="rest-play-btn" aria-label="Start rest timer">▶</button>
    </div>
    <div class="set-grid">
      <div class="set-grid-header"><span></span><span>Reps</span><span>Weight (kg)</span><span></span></div>
      <div class="set-rows"></div>
    </div>
    <button type="button" class="add-set-btn">+ Add set</button>
    <textarea class="note-input" placeholder="Add your note here…">${log.note || ""}</textarea>
    <div class="log-actions">
      <button type="button" class="primary-btn log-save-btn">Save Changes</button>
      <button type="button" class="primary-btn secondary log-cancel-btn">Cancel</button>
    </div>
  `;

  const rowsEl = panel.querySelector(".set-rows");
  function renderSetRows() {
    rowsEl.innerHTML = "";
    log.sets.forEach((s, i) => {
      const r = document.createElement("div");
      r.className = "set-row";
      r.innerHTML = `
        <span class="set-num">${i + 1}</span>
        <input type="number" inputmode="numeric" class="set-reps" placeholder="0" value="${s.reps}">
        <input type="number" inputmode="decimal" class="set-weight" placeholder="0" value="${s.weight}">
        <button type="button" class="set-check${s.done ? " done" : ""}" aria-label="Mark set ${i + 1} complete">✓</button>
      `;
      r.querySelector(".set-reps").addEventListener("input", e => { s.reps = e.target.value; });
      r.querySelector(".set-weight").addEventListener("input", e => { s.weight = e.target.value; });
      r.querySelector(".set-check").addEventListener("click", () => {
        s.done = !s.done;
        renderSetRows();
      });
      rowsEl.appendChild(r);
    });
  }
  renderSetRows();

  panel.querySelector(".add-set-btn").addEventListener("click", () => {
    log.sets.push({ reps: "", weight: "", done: false });
    renderSetRows();
  });

  let restInterval = null;
  panel.querySelector(".rest-play-btn").addEventListener("click", e => {
    const btn = e.currentTarget;
    const display = panel.querySelector("#rest-time-display");
    if (restInterval) { clearInterval(restInterval); restInterval = null; }
    let remaining = log.restSeconds;
    btn.disabled = true;
    restInterval = setInterval(() => {
      remaining -= 1;
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      display.textContent = `Rest: ${m}:${String(s).padStart(2, "0")}`;
      if (remaining <= 0) {
        clearInterval(restInterval);
        restInterval = null;
        display.textContent = `Rest for ${Math.round(log.restSeconds / 60) || 1} min`;
        btn.disabled = false;
      }
    }, 1000);
  });

  panel.querySelector(".log-save-btn").addEventListener("click", () => {
    log.note = panel.querySelector(".note-input").value;
    ex._log = log;
    ex._done = log.sets.some(s => s.done);
    if (restInterval) clearInterval(restInterval);
    onSave();
  });
  panel.querySelector(".log-cancel-btn").addEventListener("click", () => {
    if (restInterval) clearInterval(restInterval);
    onSave();
  });

  return panel;
}

// ---------- save quick workout ----------
document.getElementById("save-btn").addEventListener("click", () => {
  if (!currentWorkout) return;
  const saved = JSON.parse(localStorage.getItem("savedWorkouts") || "[]");
  saved.unshift({ kind: "workout", data: currentWorkout });
  localStorage.setItem("savedWorkouts", JSON.stringify(saved));
  const btn = document.getElementById("save-btn");
  btn.textContent = "Saved ✓";
  setTimeout(() => { btn.textContent = "Save Workout"; }, 1500);
});

// ============================================================
// RENDERING — multi-week plan
// ============================================================
function renderPlan(plan) {
  const titleMap = { strength: "Strength", cardio: "Cardio", fatloss: "Fat Loss", mobility: "Mobility", general: "General Fitness" };
  document.getElementById("plan-title").textContent =
    `${titleMap[plan.goal]} · ${plan.daysPerWeek}x/wk · ${plan.weeksCount}wk`;

  const tabsEl = document.getElementById("plan-week-tabs");
  tabsEl.innerHTML = "";
  plan.weeks.forEach((wk, i) => {
    const btn = document.createElement("button");
    btn.className = "week-tab" + (i === activeWeekIndex ? " active" : "");
    btn.textContent = `Week ${i + 1}`;
    btn.addEventListener("click", () => {
      activeWeekIndex = i;
      renderPlan(plan);
    });
    tabsEl.appendChild(btn);
  });

  const dayListEl = document.getElementById("plan-day-list");
  dayListEl.innerHTML = "";
  const week = plan.weeks[activeWeekIndex];
  const dayNames = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];

  week.days.forEach((day, dayIdx) => {
    const card = document.createElement("div");
    if (day.isRest) {
      card.className = "day-card rest";
      card.innerHTML = `
        <div>
          <div class="day-name">${dayNames[dayIdx]} · Rest Day</div>
        </div>
        <div class="rest-icon">🌙</div>
      `;
      dayListEl.appendChild(card);
      return;
    }
    const allExercises = day.blocks.flatMap(b => b.items);
    const anyLogged = allExercises.some(ex => exerciseIsLogged(ex));
    const allLogged = allExercises.length > 0 && allExercises.every(ex => exerciseIsLogged(ex));
    card.className = "day-card";
    card.innerHTML = `
      <div class="day-header">
        <span class="day-name">${allLogged ? '<span class="day-check">✓</span> ' : ""}${dayNames[dayIdx]}</span>
        <span class="day-focus">${day.focus} · ${day.duration} min${anyLogged && !allLogged ? " · In progress" : ""}</span>
      </div>
      <div class="day-exercises"></div>
    `;
    const exContainer = card.querySelector(".day-exercises");
    const planParamsForDay = { ...lastParams, duration: day.duration };
    renderBlocksInto(exContainer, day.blocks, planParamsForDay, () => renderPlan(plan));
    dayListEl.appendChild(card);
  });
}

document.getElementById("save-plan-btn").addEventListener("click", () => {
  if (!currentPlan) return;
  const saved = JSON.parse(localStorage.getItem("savedWorkouts") || "[]");
  saved.unshift({ kind: "plan", data: currentPlan });
  localStorage.setItem("savedWorkouts", JSON.stringify(saved));
  const btn = document.getElementById("save-plan-btn");
  btn.textContent = "Saved ✓";
  setTimeout(() => { btn.textContent = "Save Plan"; }, 1500);
});

// ============================================================
// SAVED LIST (workouts + plans)
// ============================================================
function renderSaved() {
  const saved = JSON.parse(localStorage.getItem("savedWorkouts") || "[]");
  const list = document.getElementById("saved-list");
  list.innerHTML = "";
  if (!saved.length) {
    list.innerHTML = `<div class="empty-state">Nothing saved yet.<br>Build a workout or plan in the Build tab.</div>`;
    return;
  }
  const titleMap = { strength: "Strength", cardio: "Cardio", fatloss: "Fat Loss", mobility: "Mobility", general: "General Fitness" };
  saved.forEach((entry, i) => {
    const w = entry.data;
    const item = document.createElement("div");
    item.className = "saved-item";
    const date = new Date(w.createdAt);
    if (entry.kind === "plan") {
      item.innerHTML = `
        <div>
          <div class="title">${titleMap[w.goal]} Plan · ${w.daysPerWeek}x/wk · ${w.weeksCount}wk</div>
          <div class="sub">${date.toLocaleDateString()} · ${w.difficulty}</div>
        </div>
        <button data-i="${i}">Delete</button>
      `;
      item.querySelector("div").addEventListener("click", () => {
        currentPlan = w;
        activeWeekIndex = 0;
        lastParams = { goal: w.goal, difficulty: w.difficulty, equipment: new Set(w.equipment), muscles: new Set() };
        renderPlan(w);
        showTab("plan-screen");
      });
    } else {
      item.innerHTML = `
        <div>
          <div class="title">${titleMap[w.goal]} · ${w.duration} min</div>
          <div class="sub">${date.toLocaleDateString()} · ${w.difficulty}</div>
        </div>
        <button data-i="${i}">Delete</button>
      `;
      item.querySelector("div").addEventListener("click", () => {
        lastParams = { goal: w.goal, duration: w.duration, difficulty: w.difficulty, equipment: new Set(w.equipment), muscles: new Set() };
        renderWorkout(w);
        showTab("workout-screen");
      });
    }
    item.querySelector("button").addEventListener("click", e => {
      e.stopPropagation();
      const arr = JSON.parse(localStorage.getItem("savedWorkouts") || "[]");
      arr.splice(i, 1);
      localStorage.setItem("savedWorkouts", JSON.stringify(arr));
      renderSaved();
    });
    list.appendChild(item);
  });
}

// register service worker for offline/home-screen use
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ============================================================
// HOME SCREEN
// ============================================================
function updateHomeStats() {
  const savedWorkouts = JSON.parse(localStorage.getItem("savedWorkouts") || "[]");
  const todayLog = getFoodLogFor(todayKey());
  const totals = sumNutrients(todayLog);
  const targets = getNutritionTargets();
  const calEl = document.getElementById("stat-calories");
  const woEl = document.getElementById("stat-workouts");
  if (calEl) calEl.textContent = Math.round(totals.calories);
  if (woEl) woEl.textContent = savedWorkouts.length;

  const greetingEl = document.getElementById("hero-greeting");
  if (greetingEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    greetingEl.textContent = greeting;
  }

  const calSubEl = document.getElementById("home-cal-sub");
  if (calSubEl) calSubEl.textContent = `${Math.round(totals.calories)} / ${targets.calories} kcal today`;
  const savedSubEl = document.getElementById("home-saved-sub");
  if (savedSubEl) savedSubEl.textContent = `${savedWorkouts.length} workout${savedWorkouts.length === 1 ? "" : "s"} saved`;

  setMiniRing("protein", totals.protein, targets.protein);
  setMiniRing("carbs", totals.carbs, targets.carbs);
  setMiniRing("fat", totals.fat, targets.fat);
}

function setMiniRing(key, value, target) {
  const ring = document.getElementById(`home-ring-${key}`);
  const text = document.getElementById(`home-ring-${key}-text`);
  if (!ring) return;
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  ring.style.setProperty("--pct", pct);
  if (text) text.textContent = `${Math.round(value)}g`;
}

document.querySelectorAll(".action-tile").forEach(tile => {
  tile.addEventListener("click", () => {
    const goto = tile.dataset.goto;
    if (tile.dataset.presetmode && goto === "setup-screen") {
      const target = tile.dataset.presetmode;
      document.querySelectorAll(".mode-btn").forEach(b => {
        const isTarget = b.dataset.value === target;
        b.classList.toggle("selected", isTarget);
        b.setAttribute("aria-selected", isTarget ? "true" : "false");
      });
      state.mode = target;
      document.querySelectorAll(".plan-only").forEach(el => el.hidden = state.mode !== "plan");
      document.getElementById("duration-label").textContent = state.mode === "plan" ? "Minutes per day" : "Duration";
      document.getElementById("generate-btn").textContent = state.mode === "plan" ? "Generate Plan" : "Generate Workout";
    }
    if (tile.dataset.openscan) {
      showTab(goto);
      openScanner();
    } else {
      showTab(goto);
    }
  });
});

// override showTab to also refresh home stats + update topbar title
const titleByScreen = {
  "home-screen": "Workout Builder",
  "setup-screen": "Build",
  "workout-screen": "Your Workout",
  "plan-screen": "Your Plan",
  "nutrition-screen": "Nutrition",
  "saved-screen": "Saved"
};
const _origShowTab = showTab;
showTab = function (id) {
  _origShowTab(id);
  const titleEl = document.getElementById("topbar-title");
  if (titleEl && titleByScreen[id]) titleEl.textContent = titleByScreen[id];
  if (id === "home-screen") updateHomeStats();
  if (id === "nutrition-screen") renderFoodLog();
  // sync bottom tabbar highlight for screens not directly in tabbar (workout/plan detail views)
  const tabMap = { "setup-screen": "setup-screen", "workout-screen": "setup-screen", "plan-screen": "setup-screen" };
  const activeTabId = tabMap[id] || id;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === activeTabId));
};

// ============================================================
// NUTRITION — date-aware food log storage
// ============================================================
let activeFoodDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, defaults to today

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function getFoodLogAll() {
  return JSON.parse(localStorage.getItem("foodLog") || "{}");
}

function getFoodLogFor(key) {
  const all = getFoodLogAll();
  return all[key] || [];
}

function getTodayFoodLog() {
  return getFoodLogFor(activeFoodDate);
}

function saveFoodLogFor(key, entries) {
  const all = getFoodLogAll();
  all[key] = entries;
  localStorage.setItem("foodLog", JSON.stringify(all));
}

function saveTodayFoodLog(entries) {
  saveFoodLogFor(activeFoodDate, entries);
}

// ---------- nutrition targets (calories + macros, goal-aware) ----------
const DEFAULT_TARGETS = { calories: 2000, protein: 150, carbs: 200, fat: 65, goalType: "maintain" };

function getNutritionTargets() {
  try {
    const stored = JSON.parse(localStorage.getItem("nutritionTargets"));
    if (stored && stored.calories) return stored;
  } catch (e) {}
  return { ...DEFAULT_TARGETS };
}

function setNutritionTargets(targets) {
  localStorage.setItem("nutritionTargets", JSON.stringify(targets));
}

// backward-compat shim: some code paths may still ask for just the calorie number
function getCalorieGoal() {
  return getNutritionTargets().calories;
}

// Mifflin-St Jeor BMR -> TDEE -> goal-adjusted calories -> macro split
function calculateTargets({ sex, age, weightKg, heightCm, activityFactor, goalType }) {
  const bmr = sex === "female"
    ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const tdee = bmr * activityFactor;

  let calories = tdee;
  let proteinPerKg = 1.8;
  let fatPct = 0.25;

  if (goalType === "lose") {
    calories = tdee - 500;
    proteinPerKg = 2.0; // higher protein to preserve muscle in a deficit
    fatPct = 0.25;
  } else if (goalType === "gain") {
    calories = tdee + 300;
    proteinPerKg = 1.8;
    fatPct = 0.22;
  } else {
    calories = tdee;
    proteinPerKg = 1.6;
    fatPct = 0.27;
  }
  calories = Math.max(1200, Math.round(calories));

  const protein = Math.round(weightKg * proteinPerKg);
  const fat = Math.round((calories * fatPct) / 9);
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbs = Math.max(0, Math.round((calories - proteinCals - fatCals) / 4));

  return { calories, protein, carbs, fat, goalType };
}

function sumNutrients(entries) {
  return entries.reduce((acc, e) => {
    acc.calories += e.calories || 0;
    acc.protein += e.protein || 0;
    acc.carbs += e.carbs || 0;
    acc.fat += e.fat || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderDateStrip() {
  const stripEl = document.getElementById("date-strip");
  stripEl.innerHTML = "";
  const all = getFoodLogAll();
  const today = new Date();
  const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // show last 13 days + today (14 total), oldest first so "today" sits at the right edge
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  days.forEach(d => {
    const key = dateKey(d);
    const isToday = key === todayKey();
    const hasEntries = (all[key] || []).length > 0;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "date-chip" + (key === activeFoodDate ? " selected" : "") + (hasEntries ? " has-entries" : "");
    chip.setAttribute("role", "tab");
    chip.setAttribute("aria-selected", key === activeFoodDate ? "true" : "false");
    chip.innerHTML = `
      <span class="dow">${isToday ? "Today" : dowNames[d.getDay()]}</span>
      <span class="dom">${d.getDate()}</span>
      <span class="dot"></span>
    `;
    chip.addEventListener("click", () => {
      activeFoodDate = key;
      renderFoodLog();
    });
    stripEl.appendChild(chip);
  });

  // auto-scroll to the end (today) on first render
  requestAnimationFrame(() => { stripEl.scrollLeft = stripEl.scrollWidth; });
}

function renderFoodLog() {
  renderDateStrip();

  const entries = getTodayFoodLog();
  const totals = sumNutrients(entries);
  const targets = getNutritionTargets();

  document.getElementById("n-cal").textContent = Math.round(totals.calories);
  document.getElementById("n-cal-goal").textContent = targets.calories;

  const pct = targets.calories > 0 ? Math.min(100, (totals.calories / targets.calories) * 100) : 0;
  const fillEl = document.getElementById("cal-progress-fill");
  fillEl.style.width = pct + "%";
  fillEl.classList.toggle("over", totals.calories > targets.calories);

  const goalLabels = { lose: "Lose Fat", maintain: "Maintain", gain: "Build Muscle" };
  const badgeEl = document.getElementById("goal-type-badge");
  if (badgeEl) badgeEl.textContent = goalLabels[targets.goalType] || "Maintain";

  function setMacroRing(key, value, target) {
    const pctVal = target > 0 ? Math.min(100, (value / target) * 100) : 0;
    const ringEl = document.getElementById(`ring-${key}`);
    if (ringEl) ringEl.style.setProperty("--pct", pctVal);
    document.getElementById(`n-${key}-text`).textContent = `${Math.round(value)}/${target}g`;
  }
  setMacroRing("protein", totals.protein, targets.protein);
  setMacroRing("carbs", totals.carbs, targets.carbs);
  setMacroRing("fat", totals.fat, targets.fat);

  const isToday = activeFoodDate === todayKey();
  const dateLabel = isToday ? "Today" : new Date(activeFoodDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  document.getElementById("day-totals-heading").textContent = `${dateLabel}'s Totals`;
  document.getElementById("food-log-heading").textContent = `Logged ${isToday ? "Today" : "on " + dateLabel}`;

  const listEl = document.getElementById("food-log-list");
  listEl.innerHTML = "";
  if (!entries.length) {
    listEl.innerHTML = `<div class="empty-state">No food logged ${isToday ? "today" : "this day"}.${isToday ? "<br>Scan a barcode to get started." : ""}</div>`;
    return;
  }
  entries.forEach((e, i) => {
    const card = document.createElement("div");
    card.className = "food-card";
    card.innerHTML = `
      ${e.image ? `<img src="${e.image}" alt="" loading="lazy">` : `<div class="food-card-noimg"></div>`}
      <div class="info">
        <div class="name">${e.name}</div>
        <div class="brand">${e.brand || ""}</div>
        <div class="macros">P ${Math.round(e.protein)}g · C ${Math.round(e.carbs)}g · F ${Math.round(e.fat)}g</div>
      </div>
      <div class="cal">${Math.round(e.calories)}<br><small>kcal</small></div>
      <button class="remove-btn" aria-label="Remove ${e.name}">✕</button>
    `;
    card.querySelector(".remove-btn").addEventListener("click", () => {
      const current = getTodayFoodLog();
      current.splice(i, 1);
      saveTodayFoodLog(current);
      renderFoodLog();
    });
    listEl.appendChild(card);
  });
}

function addFoodEntry(entry) {
  activeFoodDate = todayKey(); // always log new scans to today
  const entries = getTodayFoodLog();
  entries.unshift({ ...entry, loggedAt: new Date().toISOString() });
  saveTodayFoodLog(entries);
  renderFoodLog();
}

// ---------- nutrition goal modal ----------
const goalModalState = { goalmode: "calculate", nutriGoal: "maintain", sex: "male", activity: "1.375" };

document.querySelectorAll('[data-field="goalmode"], [data-field="nutriGoal"], [data-field="sex"], [data-field="activity"]').forEach(group => {
  const field = group.dataset.field;
  group.addEventListener("click", e => {
    const btn = e.target.closest(".chip, .mode-btn");
    if (!btn) return;
    group.querySelectorAll(".chip, .mode-btn").forEach(c => {
      c.classList.remove("selected");
      c.setAttribute("aria-selected", "false");
    });
    btn.classList.add("selected");
    btn.setAttribute("aria-selected", "true");
    goalModalState[field] = btn.dataset.value;

    if (field === "goalmode") {
      const isManual = btn.dataset.value === "manual";
      document.getElementById("goal-calc-fields").hidden = isManual;
      document.getElementById("goal-manual-fields").hidden = !isManual;
    }
    updateGoalPreview();
  });
});

function updateGoalPreview() {
  const previewEl = document.getElementById("goal-preview");
  if (!previewEl || goalModalState.goalmode !== "calculate") return;
  const age = parseFloat(document.getElementById("goal-age").value);
  const weightKg = parseFloat(document.getElementById("goal-weight").value);
  const heightCm = parseFloat(document.getElementById("goal-height").value);
  if (!age || !weightKg || !heightCm) {
    previewEl.innerHTML = "Enter your details above to see your personalised targets.";
    return;
  }
  const t = calculateTargets({
    sex: goalModalState.sex,
    age, weightKg, heightCm,
    activityFactor: parseFloat(goalModalState.activity),
    goalType: goalModalState.nutriGoal
  });
  previewEl.innerHTML = `Target: <strong>${t.calories} kcal</strong><br>Protein <strong>${t.protein}g</strong> · Carbs <strong>${t.carbs}g</strong> · Fat <strong>${t.fat}g</strong>`;
}

["goal-age", "goal-weight", "goal-height"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateGoalPreview);
});

document.getElementById("cal-goal-btn").addEventListener("click", () => {
  const targets = getNutritionTargets();
  document.getElementById("manual-cal").value = targets.calories;
  document.getElementById("manual-protein").value = targets.protein;
  document.getElementById("manual-carbs").value = targets.carbs;
  document.getElementById("manual-fat").value = targets.fat;
  document.getElementById("goal-modal").hidden = false;
});
document.getElementById("goal-cancel-btn").addEventListener("click", () => {
  document.getElementById("goal-modal").hidden = true;
});
document.getElementById("goal-save-btn").addEventListener("click", () => {
  let targets;
  if (goalModalState.goalmode === "manual") {
    targets = {
      calories: parseInt(document.getElementById("manual-cal").value, 10) || DEFAULT_TARGETS.calories,
      protein: parseInt(document.getElementById("manual-protein").value, 10) || DEFAULT_TARGETS.protein,
      carbs: parseInt(document.getElementById("manual-carbs").value, 10) || DEFAULT_TARGETS.carbs,
      fat: parseInt(document.getElementById("manual-fat").value, 10) || DEFAULT_TARGETS.fat,
      goalType: goalModalState.nutriGoal
    };
  } else {
    const age = parseFloat(document.getElementById("goal-age").value);
    const weightKg = parseFloat(document.getElementById("goal-weight").value);
    const heightCm = parseFloat(document.getElementById("goal-height").value);
    if (!age || !weightKg || !heightCm) {
      alert("Please enter age, weight, and height to calculate your targets, or switch to manual entry.");
      return;
    }
    targets = calculateTargets({
      sex: goalModalState.sex,
      age, weightKg, heightCm,
      activityFactor: parseFloat(goalModalState.activity),
      goalType: goalModalState.nutriGoal
    });
  }
  setNutritionTargets(targets);
  document.getElementById("goal-modal").hidden = true;
  renderFoodLog();
});

// ============================================================
// NUTRITION — Open Food Facts lookup
// ============================================================
async function lookupBarcode(code) {
  const resultEl = document.getElementById("scan-result");
  resultEl.innerHTML = `<div class="scan-feedback">Looking up ${code}…</div>`;
  try {
    const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const data = await resp.json();
    if (data.status !== 1 || !data.product) {
      resultEl.innerHTML = `<div class="scan-feedback">No product found for barcode ${code}. Try another or enter manually.</div>`;
      return;
    }
    const p = data.product;
    const n = p.nutriments || {};
    const serving = p.serving_size || "100 g";
    const item = {
      name: p.product_name || p.generic_name || "Unknown product",
      brand: p.brands || "",
      image: p.image_front_small_url || p.image_small_url || "",
      serving,
      calories: n["energy-kcal_serving"] ?? n["energy-kcal_100g"] ?? 0,
      protein: n["proteins_serving"] ?? n["proteins_100g"] ?? 0,
      carbs: n["carbohydrates_serving"] ?? n["carbohydrates_100g"] ?? 0,
      fat: n["fat_serving"] ?? n["fat_100g"] ?? 0,
      barcode: code
    };
    renderScanResult(item);
  } catch (err) {
    resultEl.innerHTML = `<div class="scan-feedback">Couldn't reach the food database. Check your connection and try again.</div>`;
  }
}

function renderScanResult(item) {
  const resultEl = document.getElementById("scan-result");
  resultEl.innerHTML = `
    <div class="scan-result-card">
      <div class="result-name">${item.name}</div>
      ${item.brand ? `<div class="result-brand">${item.brand}</div>` : ""}
      <div class="result-grid">
        <div class="stat"><div class="stat-value">${Math.round(item.calories)}</div><div class="stat-label">kcal</div></div>
        <div class="stat"><div class="stat-value">${Math.round(item.protein)}</div><div class="stat-label">protein g</div></div>
        <div class="stat"><div class="stat-value">${Math.round(item.carbs)}</div><div class="stat-label">carbs g</div></div>
        <div class="stat"><div class="stat-value">${Math.round(item.fat)}</div><div class="stat-label">fat g</div></div>
      </div>
      <div style="font-size:12px;color:#978cb3;margin-bottom:10px;">Per serving: ${item.serving}</div>
      <button type="button" class="primary-btn result-add">Add to Today's Log</button>
    </div>
  `;
  resultEl.querySelector(".result-add").addEventListener("click", () => {
    addFoodEntry(item);
    resultEl.innerHTML = `<div class="scan-feedback">Added ✓</div>`;
    updateHomeStats();
  });
}

document.getElementById("manual-barcode-form").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("manual-barcode-input");
  const code = input.value.trim();
  if (!code) return;
  lookupBarcode(code);
  input.value = "";
});

// ============================================================
// NUTRITION — camera barcode scanner (ZXing)
// ============================================================
let zxingReader = null;
let scannerStream = null;

function openScanner() {
  const modal = document.getElementById("scanner-modal");
  const statusEl = document.getElementById("scanner-status");
  const video = document.getElementById("scanner-video");
  modal.hidden = false;
  statusEl.textContent = "Requesting camera access…";

  if (typeof ZXing === "undefined") {
    statusEl.textContent = "Scanner library failed to load. Use manual entry instead.";
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = "Camera isn't available on this browser. Use manual entry below.";
    return;
  }

  // Must call getUserMedia synchronously within the click handler on iOS Safari —
  // any delay (setTimeout, extra await before the first media call) causes a silent denial.
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => {
      scannerStream = stream;
      video.srcObject = stream;
      video.play().catch(() => {});
      statusEl.textContent = "Point your camera at a barcode";

      zxingReader = new ZXing.BrowserMultiFormatReader();
      zxingReader.decodeFromStream(stream, video, (result, err) => {
        if (result) {
          statusEl.textContent = `Found: ${result.getText()}`;
          closeScanner();
          lookupBarcode(result.getText());
        }
      });
    })
    .catch(err => {
      if (err && err.name === "NotAllowedError") {
        statusEl.textContent = "Camera permission denied. Enable it in Settings → Safari → Camera, or use manual entry below.";
      } else if (err && err.name === "NotFoundError") {
        statusEl.textContent = "No camera found on this device. Use manual entry below.";
      } else {
        statusEl.textContent = "Camera unavailable (" + (err && err.message ? err.message : "unknown error") + "). Use manual entry below.";
      }
    });
}

function closeScanner() {
  const modal = document.getElementById("scanner-modal");
  modal.hidden = true;
  if (zxingReader) {
    try { zxingReader.reset(); } catch (e) {}
    zxingReader = null;
  }
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  const video = document.getElementById("scanner-video");
  if (video) video.srcObject = null;
}

document.getElementById("scan-btn").addEventListener("click", openScanner);
document.getElementById("scanner-close-btn").addEventListener("click", closeScanner);

// ============================================================
// init
// ============================================================
updateHomeStats();
