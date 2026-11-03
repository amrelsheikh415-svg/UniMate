/* ---------- الخطة الذكية ---------- */
function nextExam(sid, t) {
  const d = S.exams.filter(e => e.sid === sid && dnum(e.date) >= t).map(e => dnum(e.date) - t);
  return d.length ? Math.min(...d) : null;
}
function dailyHoursFor(date) {
  const dayHours = S.profile.dayHours && S.profile.dayHours[date.getDay()];
  return Math.max(0, dayHours === undefined ? (Number(S.profile.hours) || 0.5) : Number(dayHours));
}
function completedAfter(id, sourceDate, throughDate) {
  return Object.entries(S.done || {}).some(([key, value]) => {
    const split = key.indexOf("|"), day = key.slice(0, split), taskId = key.slice(split + 1);
    return value && taskId === id && day > sourceDate && day <= throughDate;
  });
}
function carryForDate(date) {
  const day = iso(date), todayNum = dnum(day);
  return (S.planCarry || []).filter(x => x.targetDate && dnum(x.targetDate) <= todayNum && !completedAfter(x.id, x.sourceDate, day));
}
function rememberPlan(day, plan) {
  S.planHistory = S.planHistory || {};
  const snapshot = plan.map(({ id, name, c, min, left, undone }) => ({ id, name, c, min, left, undone }));
  if (JSON.stringify(S.planHistory[day]) !== JSON.stringify(snapshot)) S.planHistory[day] = snapshot;
  const cutoff = dnum(day) - 30;
  Object.keys(S.planHistory).forEach(k => { if (dnum(k) < cutoff) delete S.planHistory[k]; });
  S.planCarry = (S.planCarry || []).filter(x => dnum(day) - dnum(x.sourceDate) <= 30 && !completedAfter(x.id, x.sourceDate, day));
  store.save(S);
}
function missedPlanTasks(today) {
  const cutoff = dnum(today) - 7, seen = new Set(), missed = [];
  const history = S.planHistory || {}, dismissed = S.planDismissed || {};
  Object.keys(history).sort().forEach(day => {
    if (day >= today || dnum(day) < cutoff) return;
    (history[day] || []).forEach(task => {
      if (!S.subjects.some(s => s.id === task.id)) return;
      if (seen.has(task.id)) return;
      const key = day + "|" + task.id;
      if (S.done[key] || dismissed[key] || completedAfter(task.id, day, today)) return;
      const alreadyCarried = (S.planCarry || []).some(x => x.id === task.id && x.sourceDate === day && !completedAfter(x.id, x.sourceDate, today));
      if (alreadyCarried) { seen.add(task.id); return; }
      seen.add(task.id);
      missed.push({ ...task, sourceDate: day });
    });
  });
  return missed;
}
function handleMissedPlans(tasks, mode, today) {
  const ids = new Set(tasks.map(x => x.id));
  S.planCarry = (S.planCarry || []).filter(x => !tasks.some(t => t.id === x.id && t.sourceDate === x.sourceDate));
  if (mode === "skip") {
    S.planDismissed = S.planDismissed || {};
    tasks.forEach(x => { S.planDismissed[x.sourceDate + "|" + x.id] = true; });
    S.planCarry = S.planCarry.filter(x => !ids.has(x.id));
  } else {
    let days = [today];
    if (mode === "today" && dailyHoursFor(new Date(today + "T00:00:00")) === 0) {
      days = [];
      for (let i = 1; i <= 7; i++) { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + i); if (dailyHoursFor(d) > 0) { days.push(iso(d)); break; } }
      if (!days.length) { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 1); days.push(iso(d)); }
    }
    if (mode === "week") {
      days = [];
      for (let i = 1; i <= 7; i++) {
        const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + i);
        if (dailyHoursFor(d) > 0) days.push(iso(d));
      }
      if (!days.length) { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() + 1); days.push(iso(d)); }
    }
    tasks.forEach((x, i) => S.planCarry.push({ id: x.id, name: x.name, c: x.c, min: x.min, sourceDate: x.sourceDate, targetDate: days[i % days.length] }));
  }
  commit();
  toast(mode === "today" ? "اتضافت للخطة، ووقتها هيتوزع على باقي المواد." : mode === "week" ? "وزّعت المهام الفائتة على الأيام المتاحة في الأسبوع." : "تمام، شلت المهام دي من قائمة التعويض.");
}
function missedPlanCard(tasks, today) {
  return h("div", { class: "card missed-plan" }, h("h3", {}, "في مهام فاتتك 🌿"),
    h("p", { class: "muted" }, tasks.map(x => x.name).join("، ") + " · حوالي " + tasks.reduce((a, x) => a + x.min, 0) + " دقيقة."),
    h("p", { class: "muted" }, "اختار ننقلها لخطة النهارده أو نوزعها على الأيام المتاحة."),
    h("div", { class: "inl" }, h("button", { class: "sm", onclick: () => handleMissedPlans(tasks, "today", today) }, dailyHoursFor(new Date(today + "T00:00:00")) > 0 ? "لخطة النهارده" : "لأول يوم متاح"),
      h("button", { class: "ghost sm", onclick: () => handleMissedPlans(tasks, "week", today) }, "وزّعها على الأسبوع"),
      h("button", { class: "ghost sm", onclick: () => handleMissedPlans(tasks, "skip", today) }, "تجاهل")));
}
function planFor(date) {
  const total = dailyHoursFor(date) * 60, t = dnum(iso(date));
  if (total < 15) return [];
  const mode = S.profile.planMode || "balanced";
  const carries = carryForDate(date), carryIds = new Set(carries.map(x => x.id));
  let list = S.subjects.map(s => {
    const left = nextExam(s.id, t), undone = s.lectures.filter(l => !l.done).length;
    const urgency = left === null ? 0.6 : Math.min(3, 14 / (left + 1));
    const backlog = Math.min(undone, 10) * 0.05;
    let w = s.diff * (1 + urgency) * (1 + backlog);
    if (mode === "exam") w = s.diff * (1 + (left === null ? 0.1 : Math.min(5, 35 / (left + 1)))) * (1 + backlog * 0.35);
    if (mode === "catchup") w = (1 + Math.min(undone, 20) * 0.16) * (1 + urgency * 0.4) * (1 + s.diff * 0.15);
    if (mode === "hard") w = s.diff * s.diff * (1 + urgency * 0.65) * (1 + backlog * 0.5);
    if (carryIds.has(s.id)) w *= 2.5;
    return { id: s.id, name: s.name, c: s.c, left, undone, w };
  }).sort((a, b) => b.w - a.w);
  if (!list.length) return [];
  for (let i = 0; i < 4; i++) {
    const sum = list.reduce((a, x) => a + x.w, 0);
    const next = list.filter(x => carryIds.has(x.id) || total * x.w / sum >= 15);
    if (next.length === list.length) break;
    list = next.length ? next : [list[0]];
    if (!next.length) break;
  }
  const sum = list.reduce((a, x) => a + x.w, 0);
  return list.map(x => ({ ...x, carry: carryIds.has(x.id), min: Math.max(5, Math.round(total * x.w / sum / 5) * 5) }));
}
function forestStreak(sessions = S.trees || []) {
  const dates = new Set(sessions.map(x => iso(new Date(tm(x).t))));
  const now = new Date(), plantedToday = dates.has(iso(now));
  if (!plantedToday) now.setDate(now.getDate() - 1);
  let current = 0;
  while (dates.has(iso(now))) { current++; now.setDate(now.getDate() - 1); }
  return { current, plantedToday };
}
function stats() {
  const dn = Object.entries(S.done), mins = dn.reduce((a, [, v]) => a + v, 0);
  const streak = forestStreak().current;
  const lec = S.subjects.reduce((a, s) => a + s.lectures.filter(l => l.done).length, 0);
  const xp = Math.round(mins / 3) + lec * 15;
  return { mins, streak, lec, xp, lvl: Math.floor(xp / 100) + 1, tasks: dn.length };
}
const BADGES = [["🌱", "أول مهمة", s => s.tasks >= 1], ["💪", "10 مهام", s => s.tasks >= 10], ["🔥", "3 أيام زراعة", s => s.streak >= 3], ["📖", "5 محاضرات", s => s.lec >= 5], ["⏱️", "ساعة مذاكرة", s => s.mins >= 60], ["🏆", "مستوى 3", s => s.lvl >= 3]];
const subj = id => S.subjects.find(s => s.id === id);

/* ---------- عناصر مشتركة ---------- */
const inp = (name, v, type = "text", extra = {}) => h("input", { name, type, value: v ?? "", required: true, ...extra });
const fld = (txt, node) => h("label", { class: "f" }, txt, node);

function profileForm(onSave, btn) {
  const p = S.profile || {};
  const year = h("select", { name: "year", required: true }, h("option", { value: "", disabled: true }, "اختار"),
    ["الأولى", "التانية", "التالتة", "الرابعة", "الخامسة أو أكتر"].map(y => h("option", { value: y }, y)));
  year.value = p.year || "";
  const planMode = h("select", { name: "planMode" }, PLAN_MODES.map(([v, l]) => h("option", { value: v }, l)));
  planMode.value = p.planMode || "balanced";
  const f = h("form", { class: "card", onsubmit: e => {
    e.preventDefault(); const g = n => f.elements[n].value;
    const pr = [...f.querySelectorAll("input[name=problem]:checked")].map(i => i.value);
    const dayHours = {}; DAYS.forEach((_, i) => { const value = g("dayHours" + i); if (value !== "" ) dayHours[i] = Math.max(0, Math.min(16, +value)); });
    if (!pr.length) { toast("اختار مشكلة واحدة على الأقل"); return; }
    onSave({ name: g("name").trim(), uni: g("uni").trim(), year: g("year"), hours: +g("hours"), planMode: g("planMode"), dayHours, problems: pr, problem: pr[0] });
  } },
    h("div", { class: "g2" }, fld("الاسم", inp("name", p.name)), fld("اسم الجامعة", inp("uni", p.uni)),
      fld("السنة الدراسية", year), fld("ساعات المذاكرة المتاحة يوميًا", inp("hours", p.hours, "number", { min: 0.5, max: 16, step: 0.5 })), fld("أولوية خطتك", planMode)),
    h("details", { class: "plan-options" }, h("summary", {}, "خصص وقت المذاكرة لكل يوم"), h("p", { class: "muted" }, "سيب اليوم فاضي لاستخدام ساعاتك اليومية العامة، أو اكتب 0 لو اليوم إجازة."), h("div", { class: "g2" }, DAYS.map((day, i) => fld(day, inp("dayHours" + i, p.dayHours && p.dayHours[i] !== undefined ? p.dayHours[i] : "", "number", { min: 0, max: 16, step: 0.5, required: false }))))),
    h("fieldset", {}, h("legend", {}, "إيه المشاكل اللي بتواجهك في المذاكرة؟ (اختار واحدة أو أكتر)"),
      Object.keys(HINTS).map(k => h("label", { class: "opt" }, h("input", { type: "checkbox", name: "problem", value: k, checked: probs(p).includes(k) }), k))),
    h("button", { type: "submit" }, btn));
  return f;
}

/* ---------- المؤقت (بيكمّل حتى لو غيّرت الصفحة) ---------- */
const DUR = [[15, "🌿", "شتلة"], [25, "🌳", "شجرة"], [45, "🌲", "صنوبرة"], [60, "🌴", "نخلة"], [90, "🌸", "شجرة مزهرة"]];
const tier = m => DUR.find(d => d[0] === m) || DUR[1];
const tm = x => (typeof x === "number" ? { t: x, m: 25 } : x);
const workSecs = () => (S.tmin || 25) * 60;
const breakSecs = () => { const m = S.tmin || 25; return (m <= 25 ? 5 : m <= 60 ? 10 : 15) * 60; };
let tLeft = (S.tmin || 25) * 60, tMode = "work", tInt = null;
let audioCtx = null;
function timerTick() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    osc.type = "sine"; osc.frequency.value = 900;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.05);
  } catch (e) {}
}
function timerChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = audioCtx || new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    [0, 0.5, 1, 1.5, 2, 2.5].forEach((offset, i) => {
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = i % 2 === 1 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.38);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(now + offset); osc.stop(now + offset + 0.4);
    });
  } catch (e) {}
}
function tPaint() {
  const e = $("time"); if (!e) return;
  e.textContent = String(Math.floor(tLeft / 60)).padStart(2, "0") + ":" + String(tLeft % 60).padStart(2, "0");
  const fs = $("focusSubject"); if (fs) fs.disabled = !!tInt || (tMode === "work" && tLeft !== workSecs());
  $("tMode").textContent = tMode === "work" ? "جلسة تركيز" : "وقت راحة";
  $("tGo").textContent = tInt ? "إيقاف مؤقت" : "ابدأ";
  const rg = $("tRing");
  if (rg) { const tot = tMode === "work" ? workSecs() : breakSecs(); rg.style.setProperty("--p", String(Math.round((1 - tLeft / tot) * 1000) / 10)); rg.style.setProperty("--c", tMode === "work" ? "var(--brand)" : "var(--mint)"); }
  const pl = $("tPlant"), cp = $("tCap"), mn = S.tmin || 25, [, em, nm] = tier(mn);
  if (pl) {
    const pr = 1 - tLeft / (tMode === "work" ? workSecs() : breakSecs());
    pl.textContent = tMode === "work" ? (pr < .34 ? "🌱" : pr < .67 ? "🌿" : em) : "☕";
    cp.textContent = tMode === "work" ? "هتطلع " + nm + " " + em + " لما تكمّل " + mn + " دقيقة من غير إعادة" : "خد راحتك شوية ☕";
  }
}
function tToggle() {
  if (tInt) { clearInterval(tInt); tInt = null; } else tInt = setInterval(() => {
    timerTick(); if (--tLeft <= 0) { timerChime(); if (tMode === "work") { plantTree(S.tmin || 25); askIntent(); } tMode = tMode === "work" ? "break" : "work"; tLeft = tMode === "work" ? workSecs() : breakSecs(); try { navigator.vibrate && navigator.vibrate(300); } catch (e) {} }
    tPaint();
  }, 1000);
  tPaint();
}
function tReset() { if (tMode === "work" && tLeft < workSecs()) toast("🥀 الشجرة دبلت... كمّل 25 دقيقة المرة الجاية"); clearInterval(tInt); tInt = null; tMode = "work"; tLeft = workSecs(); tPaint(); }

const IC = { focus: "M12 8v4l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", forest: "M12 3l5 7h-3l4 6H6l4-6H7l5-7zM12 16v5", level: "M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3z", minutes: "M9 2h6m-3 4v6l4 2M5.6 5.6l1.8 1.8M4 13a8 8 0 1016 0 8 8 0 00-16 0z", energy: "M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3L12 2z", rest: "M20.9 13.1A9 9 0 0110.9 3a9 9 0 108 10.1z", target: "M12 22a10 10 0 110-20 10 10 0 010 20zM12 17a5 5 0 110-10 5 5 0 010 10zM12 12h.01", calm: "M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 000-7.8z", start: "M12 22a10 10 0 110-20 10 10 0 010 20zM9.5 9a2.5 2.5 0 014.5 1.5c0 1.5-2 2-2 3.5M12 17h.01", home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10", ai: "M21 11.5a8.5 8.5 0 01-8.5 8.5H4l1.8-3.6A8.5 8.5 0 1121 11.5z", subjects: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13", schedule: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", exams: "M9 4h6v3H9zM6 5h12v16H6zM9 14l2 2 4-4", progress: "M4 20V10M10 20V4M16 20v-7M22 20H2", account: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0", more: "M5 12h.01M12 12h.01M19 12h.01" };
function ico(k) {
  if (k === "study") k = "subjects";
  const n = document.createElement("span"); n.className = "ic";
  n.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + IC[k] + '"/></svg>';
  return n;
}
const head = (t, sub) => h("div", { class: "head" }, h("h2", {}, t), h("p", { class: "muted" }, sub));
let toastT;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function sure(msg) {
  return new Promise(res => { const d = $("dlg"); $("dmsg").textContent = msg; d.returnValue = ""; d.onclose = () => res(d.returnValue === "ok"); d.showModal(); });
}

/* ---------- الصفحات ---------- */
