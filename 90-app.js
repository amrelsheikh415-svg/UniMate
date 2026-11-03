/* ---------- شريط الموعد القريب (يظهر في كل الصفحات حسب الأهمية) ---------- */
const urgBox = h("div", { id: "urg" }), BASE_TITLE = document.title;
const fmtMins = m => m < 60 ? m + " دقيقة" : Math.floor(m / 60) + " ساعة" + (m % 60 ? " و" + (m % 60) + " دقيقة" : "");
function urgentList() {
  const d0 = new Date(), key = iso(d0), nowMin = d0.getHours() * 60 + d0.getMinutes(), out = [];
  const add = (id, name, kind, date, time, place) => {
    const dl = dnum(date) - dnum(key); if (dl < 0 || dl > 3) return;
    let mins = null; if (dl === 0 && time) { mins = +time.slice(0, 2) * 60 + +time.slice(3, 5) - nowMin; if (mins < -60) return; }
    out.push({ id, name, kind, time, place, dl, mins });
  };
  S.exams.forEach(e => add(e.id, (subj(e.sid) || {}).name || "", e.kind || "امتحان", e.date, e.time, e.place));
  B.events.forEach(ev => add("g" + ev.id, ev.subject || "", ev.kind, ev.date, ev.time, ev.place));
  return out.sort((a, b) => a.dl - b.dl || (a.mins ?? 9999) - (b.mins ?? 9999));
}
function renderUrg() {
  const l = auth.get() ? urgentList() : [], t = l[0], key = iso(new Date());
  const hide = t && t.dl >= 2 && S.hideUrg === key;
  urgBox.replaceChildren(); urgBox.className = "";
  document.title = (t && !hide ? (t.dl === 0 ? "🚨 " + t.kind + " النهاردة — " : t.dl === 1 ? "⏰ " + t.kind + " بكرة — " : "") : "") + BASE_TITLE;
  document.querySelectorAll("#nav button, .bside button").forEach(b => { b.querySelectorAll(".dot").forEach(d => d.remove()); if (t && t.dl <= 1 && b.textContent.trim().startsWith("دراستي")) b.append(h("i", { class: "dot", "aria-hidden": "true" })); });
  if (!t || hide) return;
  const lvl = t.dl === 0 ? "l3" : t.dl === 1 ? "l2" : "l1";
  const when = t.dl === 0 ? "🚨 النهاردة" : t.dl === 1 ? "⏰ بكرة" : "📅 بعد " + t.dl + " أيام";
  const txt = when + ": " + t.kind + (t.name ? " " + t.name : "") + (t.time ? " — الساعة " + t.time : "") + (t.mins !== null ? (t.mins > 0 ? " (باقي " + fmtMins(t.mins) + ")" : " (بدأ!)") : "") + (t.place ? " • " + t.place : "") + (l.length > 1 ? " • +" + (l.length - 1) + " كمان" : "");
  if (t.dl === 0) urgBox.className = "sticky";
  urgBox.append(h("button", { type: "button", class: "urg " + lvl, role: t.dl === 0 ? "alert" : "status", onclick: () => goTab("exams") }, h("span", {}, txt),
    t.dl >= 2 ? h("span", { class: "x", role: "button", "aria-label": "إخفاء", onclick: e => { e.stopPropagation(); S.hideUrg = key; store.save(S); renderUrg(); } }, "✕") : null));
}
/* ---------- تتبّع استخدام خفيف (مرة في اليوم لكل ميزة، بدون أي محتوى) ---------- */
const TRK = (() => { try { return JSON.parse(localStorage.getItem("unimate-trk")) || {}; } catch (e) { return {}; } })();
function track(f) {
  try {
    if (!auth.get()) return; const d = iso(new Date());
    if (TRK.d !== d) { TRK.d = d; TRK.s = []; }
    if (TRK.s.includes(f)) return; TRK.s.push(f); localStorage.setItem("unimate-trk", JSON.stringify(TRK));
    rest("rpc/unimate_track", { method: "POST", body: JSON.stringify({ p_feature: f }) }).catch(() => {});
  } catch (e) {}
}
function applyHash() {
  const k = (location.hash || "").slice(1);
  if (!["home", "exams", "review", "focus", "schedule", "ai", "progress", "account", "forest", "subjects", "study"].includes(k)) return;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  if (auth.get()) goTab(k);
}
addEventListener("hashchange", applyHash);
/* ---------- دمج التبويبات ---------- */
const _v = { subjects: views.subjects, schedule: views.schedule, exams: views.exams, progress: views.progress, forest: views.forest, review: reviewView };
const subTabs = (key, items) => h("div", { class: "seg subtabs", role: "tablist" }, items.map(([k, l]) => h("button", { type: "button", role: "tab", class: "ghost sm" + (secs[key] === k ? " on" : ""), "aria-selected": String(secs[key] === k), onclick: () => { secs[key] = k; track(k); render(); window.scrollTo(0, 0); } }, l)));
views.study = () => h("div", {}, subTabs("study", [["subjects", "المواد"], ["schedule", "الجدول"], ["exams", "الامتحانات"], ["review", "مراجعة" + (dueCards().length ? " (" + dueCards().length + ")" : "")]]), _v[secs.study]());
views.progress = () => h("div", {}, subTabs("progress", [["progress", "إنجازاتي"], ["forest", "الغابة 🌳"]]), _v[secs.progress]());

/* ---------- التشغيل ---------- */
(() => { const m = location.hash.match(/^#join=([A-Za-z0-9]{4,12})$/); if (m) { S.pendingJoin = m[1].toUpperCase(); store.save(S); history.replaceState(null, "", location.pathname + location.search); } })();
const PRIMARY = ["home", "study", "focus", "ai", "progress"];
let moreOpen = false;
function goTab(k) { track(k); if (ALIAS[k]) { secs[ALIAS[k][0]] = ALIAS[k][1]; k = ALIAS[k][0]; } tab = k; moreOpen = false; render(); window.scrollTo(0, 0); }
function paintMore() {
  const m = $("more"), b = $("nav").querySelector(".more");
  m.hidden = !moreOpen || !S.profile;
  if (b) b.setAttribute("aria-expanded", String(moreOpen && !m.hidden));
  if (m.hidden) { m.replaceChildren(); return; }
  m.replaceChildren(h("div", { class: "moreback", onclick: () => { moreOpen = false; paintMore(); } }),
    h("div", { class: "moremenu", role: "menu" }, TABS.filter(([k]) => !PRIMARY.includes(k)).map(([k, l]) => h("button", { role: "menuitem", "aria-current": k === tab ? "page" : null, onclick: () => goTab(k) }, ico(k), l))));
}
addEventListener("keydown", e => { if (e.key === "Escape" && moreOpen) { moreOpen = false; paintMore(); } });
function render() {
  applyTheme();
  document.body.classList.toggle("auth", !auth.get());
  if (!auth.get()) { renderAuth(); return; }
  const nav = $("nav"), v = $("view");
  if (!S.profile) {
    moreOpen = false; $("more").hidden = true;
    nav.hidden = true;
    v.replaceChildren(h("div", {}, h("div", { class: "card hero" }, h("h2", {}, "أهلاً بيك في UniMate AI"), h("p", {}, "مساعدك الجامعي الذكي لتنظيم المذاكرة."),
      h("ul", { class: "feat" }, h("li", {}, "خطة يومية بتتغير مع قرب امتحاناتك"), h("li", {}, "متابعة محاضراتك وإنجازاتك"), h("li", {}, "مساعد ذكي يجاوب أسئلتك"))),
      profileForm(p => { S.profile = p; tab = "study"; secs.study = "subjects"; commit(); }, "يلا نبدأ")));
    return;
  }
  nav.hidden = false;
  if (S.pendingJoin) { const c = S.pendingJoin; S.pendingJoin = null; store.save(S); tab = "progress"; secs.progress = "forest"; sel = "global"; sure("تنضم لمجموعة المذاكرة " + c + " 👥؟").then(ok => { if (ok) joinRoom(c); }); }
  nav.replaceChildren(h("div", { class: "bside" }, h("span", { class: "logo" }, "U"), "UniMate AI"), ...TABS.map(([k, l]) => h("button", { class: PRIMARY.includes(k) ? "" : "sec", "aria-current": k === tab ? "page" : null, onclick: () => goTab(k) }, ico(k), l)),
    h("button", { class: "more" + (PRIMARY.includes(tab) ? "" : " cur"), "aria-label": "المزيد", "aria-haspopup": "true", "aria-expanded": "false", onclick: () => { moreOpen = !moreOpen; paintMore(); } }, ico("more"), "المزيد"));
  paintMore();
  v.replaceChildren(views[tab]());
  v.append(h("p", { class: "muted", style: "text-align:center;font-size:.75rem;margin-top:18px" }, "الإصدار 2026.10.22 — اختبارات v2"));
  tPaint();
}
const _render = render; render = function () { _render(); renderUrg(); }; setInterval(renderUrg, 30000);
render();
$("view").before(urgBox); $("view").before(annBox); document.body.append(mBox); loadAnn(); checkMaint();
if (auth.get()) { cloudBoot().catch(() => {}); loadBatches(); track("open"); applyHash(); if (S.notifOn) setTimeout(syncNotif, 2500); }
setInterval(() => { if (auth.get() && !document.hidden) { checkAccount(); cloudPush().catch(() => {}); refreshVerified(); } if (!document.hidden) { loadAnn(); checkMaint(); } }, 300000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadAnn(); checkMaint(); if (auth.get()) { checkAccount(); refreshVerified(); loadBatches(); } } });
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))addEventListener("load",()=>navigator.serviceWorker.register("sw.js").then(r=>r.update()).catch(()=>{}));
