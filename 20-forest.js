/* ---------- الغابة والمنافسة ---------- */
const FOREST_URL = AI_URL.replace("quick-service", "forest");
const TREES = ["🌳", "🌲", "🌴", "🌿", "🌵"];
let board = null, boardAt = 0, boardBusy = false;
const getPid = () => { if (!S.pid) { S.pid = (crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid()); store.save(S); } return S.pid; };
const myName = () => (S.nick || (S.profile && S.profile.name) || "طالب").slice(0, 20);
async function forestCall(action, extra = {}) {
  const r = await fetch(FOREST_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, pid: getPid(), name: myName(), ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
async function loadBoard(action = "board", extra = {}) {
  boardBusy = true;
  try { board = await forestCall(action, extra); } catch (e) { board = board || { error: true }; }
  boardBusy = false; boardAt = Date.now();
  if (tab === "forest" || tab === "leaderboard" || (tab === "progress" && secs.progress === "forest")) render();
}
function plantTree(m = 25) {
  S.trees = S.trees || []; const t = Date.now(), today = iso(new Date()), sessions = S.trees.filter(x => iso(new Date(tm(x).t)) === today).length;
  const sid = S.subjects.some(s => s.id === S.focusSid) ? S.focusSid : "", subjectName = (subj(sid) || {}).name || "مذاكرة عامة";
  const rare = sessions === 2; S.trees.push({ t, m, sid, subjectName, rare, growthSession: true });
  S.growthTrees = S.growthTrees || [];
  let growing = S.growthTrees.slice().reverse().find(x => x.sid === sid && (x.growth || 0) < 4);
  if (!growing) { growing = { t, m, sid, subjectName, growth: 0, rare: false }; S.growthTrees.push(growing); }
  growing.growth = Math.min(4, (growing.growth || 0) + 1); growing.m = Math.max(growing.m || 0, m); growing.minutes = (growing.minutes || 0) + m; growing.t = t;
  const streak = forestStreak(S.trees); S.bestForestStreak = Math.max(S.bestForestStreak || 0, streak.current);
  if (rare) growing.rare = true;
  store.save(S); plotSel = null;
  const stages = ["بذرة", "برعم", "شتلة", "شجرة كاملة"];
  toast(rare ? "إنجاز جامد! شجرة " + subjectName + " النادرة بتكبر 🌸" : "🌱 شجرة " + subjectName + " وصلت لمرحلة " + stages[growing.growth - 1]);
  loadBoard("plant", { minutes: m });
  if (tab === "forest" || tab === "leaderboard" || (tab === "progress" && secs.progress === "forest")) render();
}

/* ---------- تنبيهات الموبايل (Web Push) ---------- */
const NOTIFY_URL = AI_URL.replace("quick-service", "notify");
let notif = null, notifAt = 0, notifBusy = false;
async function notifCall(body) {
  const r = await fetch(NOTIFY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid: getPid(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...body }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j;
}
async function syncNotif() {
  notifBusy = true;
  try {
    notif = await notifCall({ action: "sync", data: {
      exams: [...S.exams.map(e => ({ id: e.id, subject: (subj(e.sid) || {}).name || "مادة", date: e.date, kind: e.kind || "", time: e.time || "", place: e.place || "", note: e.note || "" })), ...B.events.map(ev => ({ id: "g" + ev.id.slice(0, 8), subject: ev.subject || "الدفعة", date: ev.date, kind: ev.kind, time: ev.time || "", place: ev.place || "", note: ev.note || "" }))],
      cardDue: cardsOf().map(c => c.due),
      stats: { today: (S.trees || []).filter(x => iso(new Date(tm(x).t)) === iso(new Date())).reduce((a, x) => a + (tm(x).m || 0), 0), streak: forestStreak().current },
      classes: S.classes.map(c => ({ id: c.id, day: c.day, time: c.time, title: c.title })) } });
  } catch (e) { notif = { error: e.message }; }
  notifBusy = false; notifAt = Date.now(); if (tab === "account") render();
}
const keyBytes = k => Uint8Array.from(atob((k + "=".repeat((4 - k.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const pushReady = () => /^https?:/.test(location.protocol) && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
async function getReg() {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) { try { reg = await navigator.serviceWorker.register("sw.js"); } catch (e) { throw new Error("ملف sw.js مش موجود على الموقع، ارفعه جنب index.html"); } }
  await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error("الـ service worker مش بيشتغل، اتأكد إن sw.js مرفوع")), 8000))]);
  return reg;
}
async function enablePush() {
  toast("بفعّل الإشعارات...");
  try {
    const reg = await getReg();
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast(perm === "denied" ? "الإشعارات متقفولة لهذا الموقع في إعدادات المتصفح" : "لازم تدوس Allow لما المتصفح يسأل"); return; }
    const { key } = await notifCall({ action: "vapid" });
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await notifCall({ action: "push_subscribe", sub: sub.toJSON() });
    S.notifOn = true; store.save(S); await syncNotif(); toast("الإشعارات اتفعّلت ✅");
  } catch (e) { toast("تعذر التفعيل: " + e.message); }
}
async function disablePush() {
  try { const reg = await getReg(), sub = await reg.pushManager.getSubscription();
    if (sub) { await notifCall({ action: "push_unsubscribe", endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch (e) {}
  S.notifOn = false; store.save(S); render();
}
async function testPush() {
  try { const r = await notifCall({ action: "test" }); toast(r.ok ? "اتبعت تنبيه تجريبي، هيوصلك خلال ثواني" : "الإرسال فشل (" + r.statuses.join(",") + ")"); }
  catch (e) { toast(e.message === "not_subscribed" ? "فعّل الإشعارات الأول" : "تعذر الإرسال"); }
}
function notifCard() {
  const on = S.notifOn && "Notification" in window && Notification.permission === "granted";
  if (on && !notifBusy && Date.now() - notifAt > 20000) syncNotif();
  return h("div", { class: "card" }, h("h3", {}, "تنبيهات الموبايل 📲"),
    h("p", { class: "muted" }, "تنبيه الصبح بجدول يومك، وقبل المحاضرة بنص ساعة، وقبل الامتحان (3 أيام، وليلته بالمكان والأدوات، وقبله بساعتين ونص ساعة)، وتذكير بالليل لو لسه ماذاكرتش."),
    !/^https?:/.test(location.protocol) ? h("p", { class: "muted" }, "⚠️ الإشعارات بتشتغل بس لما تفتح الموقع من رابط (زي Netlify) مش من ملف على الجهاز.")
    : isIOS && !navigator.standalone ? h("p", { class: "muted" }, "على الآيفون: افتح الموقع في Safari، دوس زرار المشاركة ثم Add to Home Screen، وافتحه من الأيقونة وبعدها فعّل الإشعارات.")
    : !pushReady() ? h("p", { class: "muted" }, "المتصفح ده مش بيدعم الإشعارات. جرّب Chrome على الأندرويد.")
    : Notification.permission === "denied" ? h("p", { class: "muted" }, "الإشعارات متقفولة لهذا الموقع. افتح إعدادات الموقع في المتصفح واسمح بالإشعارات.")
    : !on ? h("button", { onclick: enablePush }, "فعّل الإشعارات")
    : h("div", {}, h("p", {}, "✅ الإشعارات شغّالة على الجهاز ده."),
        h("div", { class: "inl" }, h("button", { class: "ghost sm", onclick: testPush }, "ابعت تنبيه تجريبي"), h("button", { class: "ghost sm", onclick: disablePush }, "إيقاف"))));
}

let sel = "global";
const genCode = () => { const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; return Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join(""); };
async function joinRoom(code) {
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (code.length < 4) { toast("الكود لازم يكون 4 حروف أو أرقام على الأقل"); return; }
  try { board = await forestCall("join", { room: code }); sel = code; boardAt = Date.now(); toast("اتضمّيت للمجموعة " + code + " 👥"); render(); }
  catch (e) { toast(e.message === "room_full" ? "المجموعة امتلأت (50 عضو)" : e.message === "too_many_rooms" ? "وصلت للحد الأقصى: 10 مجموعات" : "تعذر الانضمام، جرّب تاني"); }
}
async function leaveRoom(code) {
  if (!(await sure("تطلع من المجموعة " + code + "؟"))) return;
  try { board = await forestCall("leave", { room: code }); sel = "global"; boardAt = Date.now(); render(); } catch (e) { toast("تعذر الخروج"); }
}
async function invite(c) {
  const link = /^https?:/.test(location.protocol) ? "\n" + location.href.split("#")[0] + "#join=" + c : "";
  const text = "تعالى نذاكر مع بعض على UniMate 🌳 وننافس! انضم لمجموعتي بالكود: " + c + link;
  try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast("اتنسخت الدعوة، ابعتها لصحابك"); } } catch (e) {}
}
function lbRows(list) {
  const mx = Math.max(1, ...list.map(x => x.minutes)), medal = i => ["🥇", "🥈", "🥉"][i] || (i + 1);
  return list.map((x, i) => h("div", { class: "lb" + (x.me ? " me" : "") }, h("span", { class: "r" }, medal(i)),
    h("div", { class: "n" }, h("div", { class: "lb-person" }, h("span", {}, x.name), h("span", { class: "lb-streak", title: "ستريك زراعة الشجر" }, "🔥 " + (Number.isFinite(Number(x.streak)) ? Number(x.streak) : "—"))), h("div", { class: "bar" }, h("i", { style: "width:" + Math.round(x.minutes / mx * 100) + "%" }))),
    h("span", {}, x.minutes + " د · " + x.trees + " 🌳")));
}
function challenge(list) {
  const i = list.findIndex(x => x.me); if (i < 0 || list.length < 2) return "ادعي صحابك عشان تبدأوا المنافسة! 💪";
  if (i === 0) return "👑 إنت في المركز الأول بفارق " + (list[0].minutes - list[1].minutes) + " دقيقة عن " + list[1].name + ". حافظ عليه!";
  return "🔥 فاضل " + (list[i - 1].minutes - list[i].minutes + 1) + " دقيقة وتتخطى " + list[i - 1].name;
}
const FPER = 60, frac = x => x - Math.floor(x), FKIND = { 15: "sap", 25: "tree", 45: "pine", 60: "palm", 90: "bloom" };
function treeSvg(k, c) {
  const L = "l" + c;
  if (k === "seed") return '<ellipse class="l2" cx="0" cy="-2" rx="4" ry="2.5"/><circle class="hl" cx="-1" cy="-3" r="1.2"/>';
  if (k === "sprout") return '<path class="tks" stroke-width="2" d="M0 0Q-1 -7 0 -13"/><ellipse class="l1" cx="-4" cy="-12" rx="4.5" ry="2.5" transform="rotate(-25 -4 -12)"/><ellipse class="l0" cx="4" cy="-16" rx="4.5" ry="2.5" transform="rotate(25 4 -16)"/>';
  if (k === "sapling") return '<path class="tks" stroke-width="2.4" d="M0 0V-19"/><ellipse class="l0" cx="-5" cy="-15" rx="5.5" ry="3.2"/><ellipse class="l1" cx="5" cy="-21" rx="5.5" ry="3.2"/><circle class="l2" cx="0" cy="-27" r="4"/>';
  if (k === "rare") return `<rect class="tkf" x="-2.6" y="-19" width="5.2" height="19" rx="1.5"/><circle class="l1" cx="0" cy="-30" r="14"/><circle class="l1" cx="-9" cy="-23" r="9"/><circle class="l1" cx="10" cy="-24" r="9.5"/><circle class="bl" cx="-5" cy="-35" r="4"/><circle class="bl2" cx="-5" cy="-35" r="1.5"/><circle class="bl" cx="8" cy="-28" r="4"/><circle class="bl2" cx="8" cy="-28" r="1.5"/><circle class="hl" cx="-4" cy="-39" r="6"/>`;
  if (k === "sap") return `<path class="tks" stroke-width="2.2" d="M0 0V-15"/><ellipse class="${L}" cx="-5" cy="-14" rx="6" ry="3.2" transform="rotate(-28 -5 -14)"/><ellipse class="${L}" cx="5" cy="-19" rx="6" ry="3.2" transform="rotate(28 5 -19)"/><ellipse class="${L}" cx="0" cy="-25" rx="3" ry="5"/>`;
  if (k === "pine") return `<rect class="tkf" x="-2" y="-10" width="4" height="10"/><polygon class="pn" points="0,-56 -11,-34 11,-34"/><polygon class="pn" points="0,-44 -14,-20 14,-20"/><polygon class="pn" points="0,-30 -17,-8 17,-8"/><polygon class="hl" points="0,-56 -3,-34 -11,-34"/>`;
  if (k === "palm") return `<path class="tks" stroke-width="4" d="M0 0Q6 -22 2 -44"/><path class="fr" d="M2 -44Q-8 -58 -22 -50"/><path class="fr" d="M2 -44Q12 -58 26 -50"/><path class="fr" d="M2 -44Q-12 -48 -24 -36"/><path class="fr" d="M2 -44Q16 -48 28 -36"/><path class="fr" d="M2 -44Q2 -58 3 -64"/><circle class="tkf" cx="0" cy="-42" r="2.3"/><circle class="tkf" cx="4.5" cy="-42" r="2.3"/>`;
  if (k === "bloom") return `<rect class="tkf" x="-2.6" y="-19" width="5.2" height="19" rx="1.5"/><circle class="bl" cx="0" cy="-30" r="14"/><circle class="bl" cx="-9" cy="-23" r="9"/><circle class="bl" cx="10" cy="-24" r="9.5"/><circle class="bl2" cx="-5" cy="-33" r="2.4"/><circle class="bl2" cx="6" cy="-28" r="2.4"/><circle class="bl2" cx="-11" cy="-22" r="2.2"/><circle class="bl2" cx="11" cy="-22" r="2.2"/><circle class="hl" cx="-4" cy="-35" r="6"/>`;
  return `<rect class="tkf" x="-2.6" y="-19" width="5.2" height="19" rx="1.5"/><circle class="${L}" cx="0" cy="-30" r="14"/><circle class="${L}" cx="-9" cy="-23" r="9"/><circle class="${L}" cx="10" cy="-24" r="9.5"/><circle class="hl" cx="-4" cy="-35" r="6"/>`;
}
function blossomSvg() {
  return `<g class="flowers" aria-hidden="true"><circle class="bl" cx="-8" cy="-31" r="3.7"/><circle class="bl2" cx="-8" cy="-31" r="1.35"/><circle class="bl" cx="8" cy="-27" r="3.7"/><circle class="bl2" cx="8" cy="-27" r="1.35"/><circle class="bl" cx="0" cy="-39" r="3.7"/><circle class="bl2" cx="0" cy="-39" r="1.35"/></g>`;
}
const FOREST_BG = `<defs><linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></linearGradient><linearGradient id="fgr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gs1"/><stop offset="1" class="gs2"/></linearGradient><linearGradient id="fsoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93612f"/><stop offset="1" stop-color="#563820"/></linearGradient><linearGradient id="fgrass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b6ed4e"/><stop offset=".55" stop-color="#73d13d"/><stop offset="1" stop-color="#39a942"/></linearGradient></defs>
<rect width="360" height="280" fill="url(#fsky)"/>
<g class="day"><circle class="glow" cx="300" cy="42" r="34"/><circle class="sun" cx="300" cy="42" r="17"/><ellipse class="cloud" cx="68" cy="44" rx="27" ry="8"/><ellipse class="cloud" cx="87" cy="39" rx="16" ry="8"/><ellipse class="cloud" cx="209" cy="67" rx="23" ry="7"/></g>
<g class="night"><circle class="moon" cx="300" cy="42" r="14"/>${[[40,20],[90,38],[150,16],[210,34],[250,12],[330,22],[20,64],[120,66],[200,58]].map(([x, y]) => `<circle class="star" cx="${x}" cy="${y}" r="1.3"/>`).join("")}</g>
<ellipse cx="180" cy="250" rx="126" ry="14" fill="#122f2a" opacity=".18"/>
<path d="M10 145L180 218 350 145 350 178 180 255 10 178Z" fill="url(#fsoil)"/>

<path d="M10 145L180 218 180 228 10 155Z" fill="#b87937" opacity=".75"/><path d="M180 218L350 145 350 158 180 232Z" fill="#704621" opacity=".7"/><path d="M22 151L180 219M180 219L338 151" fill="none" stroke="#d89b55" stroke-width="2" opacity=".48"/><path d="M40 164L180 226M320 164L180 226" fill="none" stroke="#452d1d" stroke-width="2" opacity=".35"/>
<path d="M10 145L180 218 350 145 180 73Z" fill="#45ae38"/>
<path d="M21 143L180 210 338 143 180 82Z" fill="url(#fgrass)"/>
<path d="M33 145Q83 127 125 150T220 143T326 143" fill="none" stroke="#d5f876" stroke-width="3" opacity=".38"/>
<g fill="#eaffb0" opacity=".8"><circle cx="53" cy="151" r="2"/><circle cx="87" cy="176" r="2"/><circle cx="130" cy="137" r="2"/><circle cx="227" cy="180" r="2"/><circle cx="279" cy="137" r="2"/><circle cx="300" cy="164" r="2"/><circle cx="163" cy="187" r="2"/></g>`;
function plotView(t) {
  const lands = Math.floor(t.length / FPER) + 1, cur = plotSel == null || plotSel >= lands ? lands - 1 : plotSel, from = cur * FPER;
  const items = t.slice(from, from + FPER).map((x, i) => {
    const f = frac(.5 + i * .5698402909), [m, , nm] = tier(tm(x).m);
    const py = 123 + f * 76, edge = py < 145 ? (py - 73) * 2.36 : (218 - py) * 2.33;
    const growth = x.growth || 0, stage = growth ? ["", "بذرة", "برعم", "شتلة", "شجرة كاملة"][growth] : "شجرة كاملة";
    return { idx: from + i, subjectName: x.subjectName || (x.growthSession ? "مذاكرة عامة" : "جلسات سابقة"), px: 180 + (frac(.5 + i * .7548776662) * 2 - 1) * edge * .78, py, sc: .52 + f * .42, m, nm: x.rare ? "شجرة نادرة" : stage, stage, growth, rare: !!x.rare, c: i % 3, fresh: from + i === t.length - 1 && Date.now() - tm(x).t < 6000 };
  }).sort((a, b) => a.py - b.py);
  const trees = items.map(o => `<g data-tree-index="${o.idx}" role="button" tabindex="0" aria-label="عرض تفاصيل ${o.stage}" transform="translate(${o.px.toFixed(1)} ${o.py.toFixed(1)}) scale(${o.sc.toFixed(2)})"><title>${o.nm} — ${o.m} دقيقة تركيز</title><ellipse class="sh" rx="11" ry="3.2"/>${o.fresh ? '<ellipse class="rip" rx="8" ry="3"/>' : ""}<g class="gw${o.fresh ? " new" : ""}${o.rare ? " rare-tree" : ""}">${treeSvg(o.growth && o.growth < 4 ? ["", "seed", "sprout", "sapling"][o.growth] : (o.rare ? "rare" : FKIND[o.m] || "tree"), o.c)}${o.growth && o.growth < 4 ? "" : blossomSvg()}</g></g>`).join("");
  const scene = h("div", { class: "scene" });
  scene.innerHTML = `<svg viewBox="0 0 360 280" role="img" aria-label="غابتك: ${items.length} شجرة">${FOREST_BG}${trees}</svg>`;
  const selectTree = e => { const g = e.target.closest("[data-tree-index]"); if (!g) return; treeFocus = t[Number(g.getAttribute("data-tree-index"))] || null; render(); };
  scene.addEventListener("click", selectTree);
  scene.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-tree-index]")) { e.preventDefault(); selectTree(e); } });
  return h("div", {},
    lands > 1 ? h("div", { class: "picks" }, Array.from({ length: lands }, (_, k) => h("button", { class: "ghost sm" + (k === cur ? " on" : ""), onclick: () => { plotSel = k; render(); } }, "غابة " + (k + 1)))) : null,
    scene,
    h("p", { class: "muted", style: "margin:8px 0 2px;text-align:center;font-size:.85rem" }, items.length ? items.length + " من " + FPER + " شجرة في الجزيرة دي — كل جلسة بتكبر غابتك 🌸 — " : "الغابة لسه فاضية. كل جلسة تركيز هتزود جزيرتك شجرة مزهرة 🌱 — ", DUR.map(([m, em]) => em + " " + m + "د").join("  ")));
}

function forestQuest(t, tot, today, plants) {
  const sessions = t.filter(x => iso(new Date(tm(x).t)) === iso(new Date())).length;
  const goal = 3, pct = Math.min(100, Math.round(sessions / goal * 100)), growing = plants.slice().reverse().find(x => x.growth && x.growth < 4), growthPct = growing ? Math.round(growing.growth / 4 * 100) : 100;
  const planted = Math.max(S.realTrees || 0, Array.isArray(S.realPlantNames) ? S.realPlantNames.length : 0), rareCount = plants.filter(x => x.rare).length, unlocked = tot >= 600;
  return h("div", { class: "card forest-quest" }, h("h3", {}, "مهمتك في الغابة 🎯"),
    h("div", { class: "questline" }, h("span", {}, sessions >= goal ? "🌸" : "🌱"), h("div", {},
      h("b", {}, sessions >= goal ? "مهمة اليوم اكتملت! فتحت شجرة نادرة" : "ازرع شجرة نادرة النهاردة"),
      h("small", {}, sessions + " من " + goal + " جلسات تركيز · جمعت " + rareCount + " شجرة نادرة"), h("div", { class: "bar" }, h("i", { style: "width:" + pct + "%" })))),
    h("div", { class: "questline" }, h("span", {}, growing ? ["", "🌰", "🌱", "🪴", "🌳"][growing.growth] : "✨"), h("div", {}, h("b", {}, growing ? "شجرتك الحالية: " + ["", "بذرة", "برعم", "شتلة", "شجرة كاملة"][growing.growth] : "جاهز تبدأ شجرة جديدة!"), h("small", {}, growing ? growing.growth + " من 4 جلسات لحد ما تكبر" : "كل 4 جلسات مكتملة تكمل دورة نمو شجرة"), h("div", { class: "bar" }, h("i", { style: "width:" + growthPct + "%" })))),
    h("div", { class: "quest-reward" }, h("b", {}, "الهدف الكبير: ازرع شجرة على أرض الواقع 🌳"),
      h("p", { class: "muted" }, unlocked ? "وصلت لـ10 ساعات مذاكرة! اختار شتلة مناسبة من مشتل قريب، واسأل عن أفضل مكان وموعد لريّها." : "ذاكرت " + Math.floor(tot / 60) + " من 10 ساعات — فاضلك " + (600 - tot) + " دقيقة لفتح مهمة الزراعة."),
      unlocked ? planted ? h("div", {}, h("p", {}, "✅ سجلت زراعة " + planted + " شجرة — إنجاز عظيم!"), (S.realPlantNames || []).map(n => h("p", { class: "muted" }, "🌿 " + n))) : h("button", { class: "sm", onclick: async () => { if (!(await sure("هل زرعت شجرة فعلًا؟ سجّل الإنجاز بعد ما تزرعها على أرض الواقع."))) return; const n = window.prompt("اكتب اسم الشجرة أو مكان زراعتها (اختياري)"); if (n === null) return; S.realPlantNames = S.realPlantNames || []; if (n.trim()) S.realPlantNames.push(n.trim().slice(0, 50)); S.realTrees = (S.realTrees || 0) + 1; store.save(S); toast("إنجاز عظيم! غابتك كبرت على أرض الواقع 🌳"); render(); } }, "سجلت إني زرعت شجرة 🌱") : null),
    h("p", { class: "muted", style: "margin-top:10px;font-size:.85rem" }, "كل 3 جلسات في اليوم تفتح شجرة نادرة، وكل جلسة كاملة تزود غابتك."));
}
const views = {
  home() {
    const st = stats(), now = new Date(), key = iso(now), plan = planFor(now);
    const availableHours = dailyHoursFor(now);
    rememberPlan(key, plan);
    const missed = missedPlanTasks(key);
    const total = plan.reduce((a, x) => a + x.min, 0), done = plan.filter(x => S.done[key + "|" + x.id]).length;
    const upcoming = S.exams.filter(e => dnum(e.date) >= dnum(key)).sort((a, b) => a.date < b.date ? -1 : 1)[0];
    const hr = now.getHours(), greet = hr < 12 ? "صباح الخير" : hr < 18 ? "أهلاً" : "مساء الخير";
    const pct = plan.length ? Math.round(done / plan.length * 100) : 0, dleft = upcoming ? dnum(upcoming.date) - dnum(key) : 0;
    const fmt = d => d.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });
    const moods = [
      { id: "energetic", icon: "energy", label: "متحمس", minutes: 25, title: "استغل حماسك في مهمة لها أولوية", steps: ["ابدأ بأعلى مادة أولوية في خطتك.", "اقفل الإشعارات وجهّز الكتاب أو المحاضرة قبل تشغيل المؤقت.", "ذاكر 25 دقيقة متواصلة، وبعدها خُد راحة قصيرة."] },
      { id: "tired", icon: "rest", label: "مرهق", minutes: 15, title: "ابدأ بحاجة خفيفة ومن غير ضغط", steps: ["ابدأ بمادة سهلة أو بمراجعة جزء تعرفه.", "اشرب مية وافتح المطلوب بس، من غير ما تفكر في باقي اليوم.", "جرّب 15 دقيقة؛ بعدها قرر تكمل أو ترتاح."] },
      { id: "distracted", icon: "target", label: "مشتت", minutes: 15, title: "صغّر البداية وقلّل المشتتات", steps: ["اكتب هدفًا واحدًا واضحًا: صفحة أو سؤال واحد.", "حط الموبايل بعيد وافتح مصدر المذاكرة فقط.", "ابدأ 15 دقيقة؛ لو سرحت، ارجع للهدف المكتوب بهدوء."] },
      { id: "anxious", icon: "calm", label: "قلقان", minutes: 15, title: "هدّي البداية وركّز على جزء واحد", steps: ["ابدأ بمادة امتحانك الأقرب أو أول مهمة مقترحة.", "خد 3 أنفاس ببطء: شهيق 4 ثواني وزفير 6 ثواني.", "راجع نقطة واحدة لمدة 15 دقيقة، وبعدها حدّد الخطوة التالية."] },
      { id: "stuck", icon: "start", label: "مش عارف أبدأ", minutes: 15, title: "حوّل البداية لخطوة صغيرة جدًا", steps: ["ابدأ بأبسط مهمة غير مكتملة في خطتك.", "افتح المحاضرة واكتب عنوان الجزء أو أول سؤال فقط.", "شغّل 15 دقيقة واشتغل على الخطوة دي وحدها."] }
    ];
    const todayMood = S.dailyMood?.day === key ? S.dailyMood.id : "";
    const chosenMood = moods.find(x => x.id === todayMood);
    const openTasks = plan.filter(x => !S.done[key + "|" + x.id]);
    const examTask = upcoming ? openTasks.find(x => x.id === upcoming.sid) : null;
    const moodTask = ["tired", "stuck"].includes(todayMood) ? openTasks.slice().sort((a, b) => (subj(a.id)?.diff || 2) - (subj(b.id)?.diff || 2) || a.min - b.min)[0] : todayMood === "anxious" ? examTask : openTasks[0];
    const moodSubject = todayMood === "anxious" && upcoming ? subj(upcoming.sid) : moodTask ? subj(moodTask.id) : upcoming ? subj(upcoming.sid) : null;
    const moodContext = moodTask ? "المهمة دي من خطة النهاردة." : todayMood === "anxious" && upcoming && moodSubject ? "اخترنا مادة امتحانك الأقرب كأولوية للمراجعة." : upcoming && moodSubject ? "مهام اليوم خلصت؛ دي مادة امتحانك الأقرب." : plan.length ? "أنجزت خطة اليوم؛ استخدم الوقت لمراجعة خفيفة." : S.subjects.length ? "مفيش جلسة محددة في خطة اليوم." : "ابدأ بمذاكرة عامة أو أضف موادك لخطة أدق.";
    return h("div", { class: "home-page" },
      h("div", { class: "card hero herobox" },
        h("div", {}, h("p", { class: "dt" }, fmt(now)), h("h2", {}, greet + " يا " + S.profile.name, vBadge()),
          h("p", {}, plan.length ? "النهاردة " + plan.length + " مهام، حوالي " + total + " دقيقة." : S.subjects.length ? (availableHours === 0 ? "النهارده يوم راحة حسب اختيارك." : "زوّد وقت اليوم لـ15 دقيقة على الأقل عشان نضيف جلسة.") : "ابدأ بإضافة موادك عشان نجهّز خطتك."), h("button", { class: "home-cta", onclick: () => goTab("focus") }, ico("focus"), "ابدأ جلسة التركيز")),
        plan.length ? h("div", { class: "ring mini", style: "--p:" + pct, role: "img", "aria-label": "أنجزت " + done + " من " + plan.length }, h("b", {}, done + "/" + plan.length)) : null),
      h("div", { class: "tiles home-stats" },
        h("div", { class: "tile", style: "--a:var(--brand)" }, h("b", {}, st.streak), h("span", { class: "metric-label" }, h("span", { class: "metric-icon" }, ico("forest")), "ستريك الغابة")),
        h("div", { class: "tile", style: "--a:var(--mint)" }, h("b", {}, st.lvl), h("span", { class: "metric-label" }, h("span", { class: "metric-icon" }, ico("level")), "المستوى")),
        h("div", { class: "tile", style: "--a:var(--brand)" }, h("b", {}, st.mins), h("span", { class: "metric-label" }, h("span", { class: "metric-icon" }, ico("minutes")), "دقيقة مذاكرة"))),
      upcoming && h("div", { class: "card exam" + (dleft <= 3 ? " hot" : "") },
        h("div", { class: "d" }, h("b", { class: dleft === 0 ? "t" : "" }, dleft === 0 ? "النهاردة" : dleft), dleft === 0 ? null : h("span", {}, "يوم")),
        h("div", { class: "i" }, h("span", { class: "muted" }, "أقرب امتحان"), h("h3", {}, subj(upcoming.sid)?.name || "امتحان"), h("span", { class: "muted" }, fmt(new Date(upcoming.date + "T00:00:00"))))),
      homeBoost(key),
      h("div", { class: "card daily-plan" }, h("div", { class: "hd" }, h("div", {}, h("span", { class: "section-kicker" }, "خطتك الشخصية"), h("h3", {}, "مهام النهاردة")), plan.length ? h("span", { class: "plan-mode" }, done + " من " + plan.length + " · " + planModeName(S.profile.planMode || "balanced")) : null),
        h("div", { class: "bar" }, h("i", { style: "width:" + (plan.length ? Math.round(done / plan.length * 100) : 0) + "%" })),
        plan.length ? plan.map((x, i) => {
          const k = key + "|" + x.id, hint = x.carry ? "جلسة مؤجلة · أولوية اليوم" : x.left !== null && x.left <= 3 ? "الامتحان قرّب، ركّز على المراجعة" : (i === 0 ? hintToday() : "");
          return h("label", { class: "row" + (S.done[k] ? " done" : "") },
            h("input", { type: "checkbox", checked: !!S.done[k], onchange: e => { e.target.checked ? S.done[k] = x.min : delete S.done[k]; commit(); } }),
            h("span", { class: "dot", style: "background:" + PAL[x.c % 5] }),
            h("span", { class: "t" }, h("span", { class: "n" }, x.name), hint && h("span", { class: "s" }, hint)),
            h("span", { class: "mins" }, x.min + " د"));
        }) : h("div", {}, h("p", { class: "muted" }, S.subjects.length ? (availableHours === 0 ? "اليوم يوم راحة حسب إعداداتك." : "خصص 15 دقيقة على الأقل لليوم عشان تظهر جلسة.") : "مفيش مواد لسه."), !S.subjects.length && h("button", { class: "sm", onclick: () => { tab = "subjects"; render(); } }, "أضف موادك"))),
      missed.length ? missedPlanCard(missed, key) : null);
  },

  focus() {
    return h("div", {}, head("جلسة التركيز 🎯", "مساحة هادية لمذاكرتك — كل جلسة كاملة تزرع شجرة في غابتك."),
      h("div", { class: "card timer" }, h("h3", { id: "tMode" }, "جلسة تركيز"),
        h("label", { class: "muted", style: "display:block;text-align:start;margin:10px 0" }, "مادة الشجرة", h("select", { id: "focusSubject", value: S.subjects.some(s => s.id === S.focusSid) ? S.focusSid : "", disabled: !!tInt || (tMode === "work" && tLeft !== workSecs()), onchange: e => { S.focusSid = e.target.value; store.save(S); } }, h("option", { value: "" }, "مذاكرة عامة"), S.subjects.map(s => h("option", { value: s.id }, s.name)))),
        h("p", { class: "muted", style: "text-align:start;font-size:.85rem" }, "اختار المادة، وكل جلسة مكتملة هتنمّي شجرتها الخاصة."),
        intentField(),
        h("div", { class: "picks" }, DUR.map(([m, em]) => h("button", { class: "ghost sm" + ((S.tmin || 25) === m ? " on" : ""), onclick: () => {
          if (tInt || tMode !== "work" || tLeft !== workSecs()) { toast("خلّص الجلسة الحالية أو دوس إعادة الأول"); return; }
          S.tmin = m; store.save(S); tLeft = workSecs(); render(); } }, m + "د " + em))),
        h("div", { class: "ring tring", id: "tRing", style: "--p:0;--c:var(--brand)" }, h("div", { class: "plant", id: "tPlant" }, "🌱"), h("div", { class: "time", id: "time" }, "25:00")),
        h("div", { class: "inl" }, h("button", { id: "tGo", onclick: tToggle }, "ابدأ"), h("button", { class: "ghost", onclick: tReset }, "إعادة")), h("p", { class: "muted", id: "tCap" }, "")));
  },

  forest() {
    const t = S.trees || [], plants = t.filter(x => !x.growthSession).concat(S.growthTrees || []), today = t.filter(x => iso(new Date(tm(x).t)) === iso(new Date())).length, tot = t.reduce((a, x) => a + tm(x).m, 0);
    const streak = forestStreak(t), bestStreak = Math.max(S.bestForestStreak || 0, streak.current);

    return h("div", {}, h("div", { class: "forest-head" }, h("div", {}, h("h2", {}, "الغابة 🌳"), h("p", { class: "muted" }, "اختار مادة قبل الجلسة، وكل مادة هتكبر شجرتها لوحدها. دوس على أي شجرة وشوف تفاصيلها.")), h("button", { class: "ghost forest-rank", title: "الترتيب", "aria-label": "افتح صفحة المنافسة والترتيب", onclick: () => goTab("leaderboard") }, "🏆")),
      h("div", { class: "tiles" },
        h("div", { class: "tile", style: "--a:var(--mint)" }, h("b", {}, plants.length), h("span", {}, "شجرة")),
        h("div", { class: "tile", style: "--a:var(--sky)" }, h("b", {}, tot), h("span", {}, "دقيقة")),
        h("div", { class: "tile", style: "--a:var(--sun)" }, h("b", {}, today), h("span", {}, "النهاردة"))),
      h("div", { class: "card forest-streak" + (streak.plantedToday ? " active" : "") }, h("div", { class: "fire" }, "🔥"), h("div", {}, h("h3", {}, "ستريكك " + streak.current + " يوم"), h("p", { class: "muted" }, streak.plantedToday ? "زرعت النهارده — حافظت على الستريك!" : streak.current ? "ازرع شجرة النهارده عشان الستريك مايروحش." : "ابدأ ستريكك بجلسة تركيز مكتملة النهارده."), h("small", { class: "muted" }, "أعلى ستريك: " + bestStreak + " يوم"))),
      h("div", { class: "card" }, h("h3", {}, "غابتك"),
        plotView(plants),
        treeFocus && plants.includes(treeFocus) ? h("div", { class: "note" }, h("b", {}, "🌳 " + (treeFocus.subjectName || "غابة عامة")), h("p", {}, treeFocus.growth ? "مرحلة الشجرة: " + ["", "بذرة", "برعم", "شتلة", "شجرة كاملة"][treeFocus.growth] + " · " + treeFocus.growth + " من 4 جلسات · " + (treeFocus.minutes || 0) + " دقيقة مذاكرة" : "شجرة مكتملة من جلساتك السابقة · " + tm(treeFocus).m + " دقيقة"), h("p", { class: "muted" }, "آخر جلسة: " + new Date(tm(treeFocus).t).toLocaleDateString("ar-EG", { day: "numeric", month: "long" }) + (treeFocus.rare ? " · شجرة نادرة 🌸" : ""))) : null,
        h("button", { class: "sm", onclick: () => goTab("focus") }, "ابدأ جلسة تركيز")),


      forestQuest(t, tot, today, plants));
  },

  leaderboard() {
    if (!boardBusy && Date.now() - boardAt > 30000) loadBoard(sel === "global" ? "board" : "room", sel === "global" ? {} : { room: sel });
    const nameI = h("input", { type: "text", maxlength: 20, placeholder: "اسمك في الترتيب", value: myName() });
    nameI.onchange = () => { S.nick = nameI.value.trim().slice(0, 20); store.save(S); loadBoard("rename"); };
    const codeI = h("input", { type: "text", maxlength: 12, placeholder: "كود المجموعة" });
    const rooms = (board && board.rooms) || [];
    const pick = (k, l) => h("button", { class: "ghost sm" + (sel === k ? " on" : ""), onclick: () => { sel = k; boardAt = 0; render(); } }, l);
    let body;
    if (!board) body = h("p", { class: "muted" }, "بحمّل الترتيب...");
    else if (board.error) body = h("p", { class: "muted" }, "مش قادر أحمّل الترتيب دلوقتي، جرّب تاني بعد شوية.");
    else if (sel === "global") body = [board.myRank ? h("p", { class: "muted" }, "ترتيبك: #" + board.myRank + " من " + board.players + " — دقايقك: " + board.myMinutes + " (" + board.myTrees + " 🌳)") : h("p", { class: "muted" }, "ازرع أول شجرة وادخل المنافسة!"), lbRows(board.top)];
    else if (!board.roomData) body = h("p", { class: "muted" }, "بحمّل المجموعة...");
    else body = [h("p", { class: "note" }, challenge(board.roomData.members)), lbRows(board.roomData.members),
      h("div", { class: "inl" }, h("button", { onclick: () => invite(sel) }, "ادعي صحابك 📨"), h("button", { class: "ghost", onclick: () => leaveRoom(sel) }, "خروج من المجموعة"))];
    return h("div", {}, head("المنافسة والترتيب 🏆", "تابع ترتيبك الأسبوعي وذاكر مع مجموعتك."),
      h("button", { class: "ghost sm", onclick: () => goTab("forest") }, "رجوع للغابة 🌳"),
      h("div", { class: "card" }, h("h3", {}, "المنافسة الأسبوعية 🏆"), h("p", { class: "muted" }, "الترتيب حسب دقايق التركيز في آخر 7 أيام"),
        h("label", { class: "muted" }, "اسمك"), nameI,
        h("div", { class: "picks" }, pick("global", "🌍 الكل"), rooms.map(r => pick(r.room, "👥 " + r.room + " (" + r.members + ")"))), body),
      h("div", { class: "card" }, h("h3", {}, "مجموعات المذاكرة 👥"),
        h("p", { class: "muted" }, "اعمل مجموعة وابعت الكود أو اللينك لصحابك، ويظهروا معاك من أي جهاز ويتنافسوا في ترتيب خاص بيكم."),
        h("div", { class: "inl" }, h("button", { onclick: () => joinRoom(genCode()) }, "أنشئ مجموعة جديدة")),
        h("div", { class: "inl", style: "margin-top:10px" }, codeI, h("button", { class: "ghost", onclick: () => joinRoom(codeI.value) }, "انضم بالكود"))));
  },
  ai() { return aiView(); },

  subjects() {
    const nameI = h("input", { type: "text", placeholder: "اسم المادة", required: true, "aria-label": "اسم المادة" });
    const diff = h("select", { "aria-label": "الصعوبة" }, [["1", "سهلة"], ["2", "متوسطة"], ["3", "صعبة"]].map(([v, l]) => h("option", { value: v }, l)));
    diff.value = "2";
    return h("div", {}, head("موادي", "ضيف موادك ومحاضراتها وتابع اللي خلصته"),
      h("form", { class: "card inl", onsubmit: e => { e.preventDefault(); S.subjects.push({ id: uid(), name: nameI.value.trim(), diff: +diff.value, c: S.subjects.length % 5, lectures: [] }); commit(); } },
        nameI, diff, h("button", { type: "submit" }, "إضافة")),
      !S.subjects.length && h("div", { class: "card empty" }, h("h3", {}, "لسه مفيش مواد"), h("p", { class: "muted" }, "أضف أول مادة من الخانة اللي فوق، وبعدها هنجهّز لك خطة يومية.")),
      S.subjects.map(s => {
        const dn = s.lectures.filter(l => l.done).length, li = h("input", { type: "text", placeholder: "اسم محاضرة جديدة", "aria-label": "محاضرة جديدة" });
        return h("div", { class: "card", style: "border-inline-start:5px solid " + PAL[s.c % 5] },
          h("div", { class: "inl" }, h("h3", { style: "flex:1;margin:0" }, s.name, h("span", { class: "chip" }, ["", "سهلة", "متوسطة", "صعبة"][s.diff])),
            h("button", { class: "ghost sm", onclick: async () => { if (await sure("حذف المادة وكل محاضراتها وامتحاناتها؟")) { S.subjects = S.subjects.filter(x => x.id !== s.id); S.exams = S.exams.filter(e => e.sid !== s.id); commit(); } } }, "حذف")),
          h("p", { class: "muted" }, "خلّصت " + dn + " من " + s.lectures.length + " محاضرة"),
          h("div", { class: "bar" }, h("i", { style: "width:" + (s.lectures.length ? Math.round(dn / s.lectures.length * 100) : 0) + "%" })),
          s.lectures.map(l => h("label", { class: "row" + (l.done ? " done" : "") },
            h("input", { type: "checkbox", checked: l.done, onchange: e => { l.done = e.target.checked; commit(); } }), h("span", { class: "t n" }, l.title))),
          h("form", { class: "inl", onsubmit: e => { e.preventDefault(); if (li.value.trim()) { s.lectures.push({ id: uid(), title: li.value.trim(), done: false }); commit(); } } },
            li, h("button", { class: "sm", type: "submit" }, "إضافة")));
      }));
  },
  schedule() {
    const day = h("select", { "aria-label": "اليوم" }, DAYS.map((d, i) => h("option", { value: i }, d)));
    const time = h("input", { type: "time", value: "09:00", required: true, "aria-label": "الوقت" });
    const title = h("input", { type: "text", placeholder: "محاضرة (مثال: فيزياء)", required: true, "aria-label": "اسم المحاضرة" });
    const now = new Date();
    return h("div", {}, head("الجدول", "محاضراتك الثابتة وخطة المذاكرة في مكان واحد"),
      h("form", { class: "card inl", onsubmit: e => { e.preventDefault(); S.classes.push({ id: uid(), day: +day.value, time: time.value, title: title.value.trim() }); commit(); } },
        day, time, title, h("button", { type: "submit" }, "إضافة محاضرة")),
      h("div", { class: "card" }, [0, 1, 2, 3, 4, 5, 6].map(i => {
        const d = new Date(now); d.setDate(d.getDate() + i);
        const cl = S.classes.filter(c => c.day === d.getDay()).sort((a, b) => a.time < b.time ? -1 : 1), pl = planFor(d);
        return h("div", { class: "wd" + (i === 0 ? " today" : "") },
          h("div", { class: "dl" }, h("b", {}, i === 0 ? "النهاردة" : DAYS[d.getDay()]), h("span", { class: "muted" }, d.getDate() + "/" + (d.getMonth() + 1))),
          h("div", { class: "dc" },
            cl.map(c => h("span", { class: "chip cls" }, h("b", {}, c.time), " " + c.title + " ", h("a", { href: "#", role: "button", "aria-label": "حذف", style: "color:inherit", onclick: e => { e.preventDefault(); S.classes = S.classes.filter(x => x.id !== c.id); commit(); } }, "✕"))),
            pl.map(x => h("span", { class: "chip st" }, h("i", { class: "dot", style: "background:" + PAL[x.c % 5] }), x.name + (x.carry ? " · تعويض" : "") + " · " + x.min + "د")),
            cl.length || pl.length ? null : h("span", { class: "muted" }, "فاضي")));
      })));
  },
  exams() {
    const sel = h("select", { "aria-label": "المادة" }, S.subjects.map(s => h("option", { value: s.id }, s.name)));
    const date = h("input", { type: "date", required: true, "aria-label": "تاريخ الامتحان" });
    const kind = h("input", { type: "text", placeholder: "نوعه (ميد، فاينال...)", "aria-label": "نوع الامتحان" });
    const key = iso(new Date());
    return h("div", {}, head("الامتحانات", "سجّل مواعيدك والخطة هتتظبط على قرب كل امتحان"),
      examForm(),
      S.exams.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(e => {
        const d = dnum(e.date) - dnum(key);
        return h("div", { class: "card exam" + (d >= 0 && d <= 3 ? " hot" : "") + (d < 0 ? " past" : "") },
          h("div", { class: "d" }, d < 0 ? h("b", { class: "t" }, "عدّى") : d === 0 ? h("b", { class: "t" }, "النهاردة") : [h("b", {}, d), h("span", {}, "يوم")]),
          h("div", { class: "i", style: "flex:1" }, h("h3", {}, (subj(e.sid)?.name || "") + (e.kind ? " — " + e.kind : "") + (e.time ? " • " + e.time : "")), h("span", { class: "muted" }, new Date(e.date + "T00:00:00").toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" }))),
          h("div", { class: "inl" }, h("button", { class: "ghost sm", onclick: () => exportIcs(e), title: "أضف للتقويم", "aria-label": "أضف للتقويم" }, "📅"), h("button", { class: "ghost sm", onclick: () => { S.exams = S.exams.filter(x => x.id !== e.id); commit(); } }, "حذف")));
      }));
  },

  progress() {
    const st = stats(), now = new Date();
    const days = [6, 5, 4, 3, 2, 1, 0].map(i => { const d = new Date(now); d.setDate(d.getDate() - i); const k = iso(d); return { d, m: Object.entries(S.done).filter(([x]) => x.startsWith(k + "|")).reduce((a, [, v]) => a + v, 0) }; });
    const max = Math.max(30, ...days.map(x => x.m));
    return h("div", {}, head("تقدمي", "إنجازاتك ومستواك وأيام التزامك"),
      h("div", { class: "card lvl" }, h("div", { class: "ring", style: "--p:" + (st.xp % 100) + ";--c:var(--sun)", role: "img", "aria-label": "المستوى " + st.lvl }, h("b", {}, st.lvl)),
        h("div", {}, h("h3", {}, "المستوى " + st.lvl), h("p", { class: "muted" }, st.xp + " نقطة — فاضل " + (100 - st.xp % 100) + " للمستوى الجاي."), h("p", { class: "muted" }, "كل 3 دقايق مذاكرة = نقطة، وكل محاضرة = 15 نقطة."))),
      h("div", { class: "tiles home-stats" },
        h("div", { class: "tile", style: "--a:var(--brand)" }, h("b", {}, st.streak), h("span", { class: "metric-label" }, h("span", { class: "metric-icon" }, ico("forest")), "ستريك الغابة")),
        h("div", { class: "tile", style: "--a:var(--pink)" }, h("b", {}, st.lec), h("span", {}, "محاضرة خلصت")),
        h("div", { class: "tile", style: "--a:var(--mint)" }, h("b", {}, st.tasks), h("span", {}, "مهمة خلصت"))),
      h("div", { class: "card" }, h("h3", {}, "مذاكرتك آخر 7 أيام"), h("p", { class: "muted" }, "المجموع " + days.reduce((a, x) => a + x.m, 0) + " دقيقة"),
        h("div", { class: "bars" }, days.map((x, i) => h("div", { class: i === 6 ? "today" : "" }, x.m, h("em", { style: "height:" + Math.round(x.m / max * 80) + "px" }), DAYS[x.d.getDay()])))),
      h("div", { class: "card" }, h("div", { class: "hd" }, h("h3", {}, "إنجازاتك"), h("span", { class: "muted" }, BADGES.filter(b => b[2](st)).length + " من " + BADGES.length)),
        h("div", { class: "badges" }, BADGES.map(([ic, t, f]) => h("div", { class: "badge" + (f(st) ? "" : " off") }, h("i", {}, ic), t)))));
  },

  account() {
    const me = S.profile, th = S.theme || "auto";
    return h("div", {}, head("حسابي", "بياناتك وتفضيلاتك"),
      h("div", { class: "card who" }, h("span", { class: "av" }, (me.name || "?").trim().charAt(0)),
        h("div", {}, h("h3", {}, me.name, vBadge()), h("span", { class: "muted" }, [me.uni, me.year && "السنة " + me.year].filter(Boolean).join(" — ")))),
      h("div", { class: "card" }, h("h3", {}, "المظهر"),
        h("div", { class: "seg", role: "group" }, [["auto", "تلقائي"], ["light", "فاتح"], ["dark", "داكن"]].map(([k, l]) => h("button", { type: "button", class: "ghost sm" + (th === k ? " on" : ""), "aria-pressed": String(th === k), onclick: () => { S.theme = k; store.save(S); render(); } }, l)))),
      profileForm(p => { S.profile = p; commit(); toast("اتحفظت بياناتك"); }, "حفظ التعديلات"),
      notifCard(),
      h("div", { class: "card" }, h("h3", {}, "الدخول"), h("p", { class: "muted", dir: "ltr", style: "text-align:start" }, niceId((auth.get() || {}).email)),
        h("button", { class: "ghost", onclick: async () => { if (await sure("تسجيل خروج؟ بياناتك محفوظة على حسابك.")) logout(); } }, "تسجيل خروج")),
      contactCard(),
      pwCard(),
      delCard(),
      h("div", { class: "card" }, h("h3", {}, "بياناتك"),
        h("p", { class: "muted" }, "بياناتك محفوظة على حسابك وبتتزامن تلقائيًا."),
        h("div", { class: "inl" },
          h("button", { class: "ghost", onclick: async () => { try { await navigator.clipboard.writeText(JSON.stringify(S)); toast("اتنسخت نسخة احتياطية من بياناتك"); } catch (e) { toast("تعذر النسخ"); } } }, "انسخ نسخة احتياطية"),
          h("button", { class: "ghost", onclick: async () => { if (await sure("هتتمسح كل بياناتك. متأكد؟")) { store.clear(); S = { profile: null, subjects: [], exams: [], classes: [], done: {} }; tab = "home"; tReset(); render(); store.save(S); } } }, "ابدأ من جديد"))));
  }
};
