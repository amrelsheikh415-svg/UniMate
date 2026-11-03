/* المساعد الذكي: بعد نشر الدالة على Supabase حط الرابط والمفتاح العام (anon) هنا */
const AI_URL = "https://meavuwntikizkfjhtnbd.supabase.co/functions/v1/quick-service";
const AI_KEY = "sb_publishable_IClfN-hW7TnDtlqM_-1xVg_DhxUlBmO";
const KEY = "unimate-v2", PAL = ["#1f3a93", "#f26a1b", "#0f9d6e", "#0e8fd1", "#c2415a"];
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربع", "الخميس", "الجمعة", "السبت"];
const TABS = [["home", "الرئيسية"], ["study", "دراستي"], ["focus", "التركيز"], ["ai", "المساعد"], ["progress", "تقدمي"], ["account", "حسابي"]];
const secs = { study: "subjects", progress: "progress" };
const ALIAS = { subjects: ["study", "subjects"], schedule: ["study", "schedule"], exams: ["study", "exams"], forest: ["progress", "forest"], review: ["study", "review"] };
const HINTS = { "تراكم المحاضرات": "صفّي محاضرة متأخرة الأول", "ضيق الوقت": "ركّز على الأكتر تكرارًا في الامتحان", "صعوبة فهم المواد": "اشرحها بصوتك كأنك بتعلّم زميلك", "التأجيل وعدم الالتزام": "ابدأ بـ10 دقايق بس" };
const PLAN_MODES = [["balanced", "متوازنة"], ["exam", "الامتحان الأقرب"], ["catchup", "المحاضرات المتراكمة"], ["hard", "المواد الأصعب"]];
const planModeName = mode => (PLAN_MODES.find(x => x[0] === mode) || PLAN_MODES[0])[1];
const probs = p => Array.isArray(p.problems) ? p.problems : p.problem ? [p.problem] : [];
const hintToday = () => { const a = probs(S.profile).filter(k => HINTS[k]); return a.length ? HINTS[a[new Date().getDate() % a.length]] : ""; };
const applyTheme = () => { const t = S.theme, r = document.documentElement; if (t === "light" || t === "dark") r.dataset.theme = t; else delete r.dataset.theme; };
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const dnum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };

/* بناء عناصر الصفحة بأمان (textContent فقط) */
function h(tag, p = {}, ...kids) {
  const n = document.createElement(tag); let val;
  for (const [k, v] of Object.entries(p)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "value") val = v;
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  kids.flat(9).forEach(x => { if (x != null && x !== false) n.append(x.nodeType ? x : document.createTextNode(x)); });
  if (val !== undefined) n.value = val;
  return n;
}

/* طبقة التخزين: دلوقتي المتصفح، وبعدين تتبدّل بـ Supabase من غير ما نغيّر باقي الكود */
const store = {
  load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
  save(s) { try { s._u = Date.now(); localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} schedulePush(); },
  clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
};
/* ---------- الحسابات والمزامنة (Supabase Auth) ---------- */
const SB = AI_URL.split("/functions")[0], AK = "unimate-auth", US = "@user.unimate.app";
const auth = { get() { try { return JSON.parse(localStorage.getItem(AK)); } catch (e) { return null; } }, set(v) { try { v ? localStorage.setItem(AK, JSON.stringify(v)) : localStorage.removeItem(AK); } catch (e) {} } };
const validUser = u => /^(?=.*[a-z])[a-z0-9._]{3,20}$/.test(u) && !/^\.|\.$|\.\./.test(u);
const toId = v => { v = String(v || "").trim().toLowerCase(); if (v.includes("@") && v[0] !== "@") return v; v = v.replace(/^@/, ""); return validUser(v) ? v + US : null; };
const niceId = e => e && e.endsWith(US) ? "@" + e.slice(0, -US.length) : (e || "");
const authMsg = (j, st) => { const t = ((j && (j.msg || j.error_description || j.message)) || "") + " " + ((j && j.error_code) || "");
  if (/invalid login|invalid_credentials/i.test(t)) return "اسم المستخدم أو كلمة المرور غلط.";
  if (/already registered|user_already_exists/i.test(t)) return "اسم المستخدم ده محجوز، اختار غيره.";
  if (/at least 6|weak_password|password should/i.test(t)) return "كلمة المرور لازم تكون 6 حروف على الأقل.";
  if (/banned/i.test(t)) return "الحساب ده محظور.";
  if (/locked/i.test(t)) return "الحساب اتقفل مؤقتًا بسبب محاولات غلط كتير. جرّب بعد " + ((j && j.retry_min) || 15) + " دقيقة.";
  if (/rate limit|too many/i.test(t)) return "محاولات كتير، استنى شوية وجرّب تاني.";
  if (/email_address_invalid/i.test(t)) return "التسجيل مش متاح دلوقتي، جرّب بعد شوية.";
  return "حصل خطأ (" + st + (j && j.error_code ? ": " + j.error_code : "") + "). جرّب تاني."; };
async function authReq(path, body) {
  const r = await fetch(path.startsWith("token?grant_type=password") ? SB + "/functions/v1/login" : SB + "/auth/v1/" + path, { method: "POST", headers: { "Content-Type": "application/json", apikey: AI_KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(authMsg(j, r.status)); e.status = r.status; throw e; }
  return j;
}
const saveSess = j => auth.set({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), uid: j.user.id, email: j.user.email });
let refP;
function doRefresh() { if (!refP) { const a = auth.get(); refP = authReq("token?grant_type=refresh_token", { refresh_token: a.refresh_token }).then(saveSess).finally(() => { refP = null; }); } return refP; }
async function checkAccount() {
  if (!auth.get()) return;
  try { await doRefresh(); }
  catch (e) { if (e.status >= 400 && e.status < 500) { authMode = "login"; authErr = "الحساب ده اتحظر أو اتحذف."; await logout(true); } }
}
async function getTok() {
  const a = auth.get(); if (!a) return null;
  if (a.expires_at - 60 > Date.now() / 1000) return a.access_token;
  try { await doRefresh(); return auth.get().access_token; }
  catch (e) { if (e.status >= 400 && e.status < 500) { await logout(true); return null; } return a.access_token; }
}
async function rest(path, opts = {}) {
  const t = await getTok(); if (!t) throw new Error("no session");
  return fetch(SB + "/rest/v1/" + path, { ...opts, headers: { apikey: AI_KEY, Authorization: "Bearer " + t, "Content-Type": "application/json", ...(opts.headers || {}) } });
}
let pushT;
function schedulePush() { if (!auth.get()) return; clearTimeout(pushT); pushT = setTimeout(() => cloudPush().catch(() => {}), 2000); }
async function cloudPush() {
  const a = auth.get(); if (!a) return; const now = new Date().toISOString(), p = S.profile || {};
  const H = { Prefer: "resolution=merge-duplicates,return=minimal" };
  await rest("unimate_user_data?on_conflict=user_id", { method: "POST", headers: H, body: JSON.stringify({ user_id: a.uid, payload: S, updated_at: now }) });
  const pr = { user_id: a.uid, last_seen_at: now, updated_at: now };
  if (a.email.endsWith(US)) pr.username = a.email.slice(0, -US.length);
  if (p.name) { pr.name = String(p.name).slice(0, 60); pr.university = String(p.uni || "").slice(0, 80); pr.study_year = String(p.year || "").slice(0, 20); }
  await rest("unimate_profiles?on_conflict=user_id", { method: "POST", headers: H, body: JSON.stringify(pr) });
}
function contactCard() {
  const kind = h("select", { "aria-label": "نوع الرسالة" }, [["problem", "مشكلة"], ["suggestion", "اقتراح"], ["other", "حاجة تانية"]].map(([v, l]) => h("option", { value: v }, l)));
  const body = h("textarea", { rows: 3, maxlength: 1000, placeholder: "اكتب رسالتك…", "aria-label": "الرسالة" });
  const list = h("div", {});
  const load = async () => { try {
    const rows = await (await rest("unimate_messages?select=body,reply,created_at&user_id=eq." + auth.get().uid + "&order=created_at.desc&limit=5")).json();
    list.replaceChildren(...(Array.isArray(rows) ? rows : []).map(m => h("div", { class: "msg" }, h("p", {}, m.body), m.reply ? h("p", { class: "reply" }, "ردّ الأدمن: " + m.reply) : h("p", { class: "muted" }, "في انتظار الرد"))));
  } catch (e) {} };
  const btn = h("button", { class: "sm", onclick: async () => {
    const t = body.value.trim(); if (!t) return toast("اكتب رسالتك الأول");
    btn.disabled = true;
    try {
      const a = auth.get();
      const r = await rest("unimate_messages", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: a.uid, username: niceId(a.email).replace(/^@/, ""), kind: kind.value, body: t }) });
      if (r.ok) { body.value = ""; toast("اتبعتت رسالتك للأدمن"); load(); } else toast("مقدرناش نبعت الرسالة (ممكن تكون وصلت للحد اليومي)");
    } catch (e) { toast("مفيش اتصال بالنت"); }
    btn.disabled = false;
  } }, "إرسال");
  load();
  return h("div", { class: "card" }, h("h3", {}, "تواصل مع الأدمن"), h("p", { class: "muted" }, "مشكلة أو اقتراح؟ ابعتلنا وهنرد عليك هنا."), kind, body, h("div", { class: "inl", style: "margin-top:8px" }, btn), list);
}
const mBox = h("div", { id: "maint", hidden: true, role: "alertdialog", "aria-label": "صيانة" });
async function checkMaint() {
  try {
    const v = ((await (await fetch(SB + "/rest/v1/unimate_settings?select=value&key=eq.maintenance", { headers: { apikey: AI_KEY } })).json())[0] || {}).value;
    if (v && v.on) { mBox.replaceChildren(h("div", { class: "maint-card" }, h("div", { class: "big" }, "🛠️"), h("h2", {}, "التطبيق في صيانة"), h("p", {}, v.message || "بنحدّث التطبيق، نرجع بعد شوية."), h("button", { onclick: checkMaint }, "جرّب تاني"))); mBox.hidden = false; }
    else { mBox.hidden = true; mBox.replaceChildren(); }
  } catch (e) {}
}
function delCard() {
  const pw = h("input", { type: "password", dir: "auto", autocomplete: "current-password", placeholder: "اكتب كلمة المرور للتأكيد", "aria-label": "كلمة المرور للتأكيد" });
  const btn = h("button", { class: "sm ghost", style: "color:var(--pink)", onclick: async () => {
    if (!pw.value) return toast("اكتب كلمة المرور الأول");
    if (!(await sure("حذف حسابك نهائيًا هو وكل بياناتك؟ مينفعش تتراجع."))) return;
    btn.disabled = true;
    try {
      const t = await getTok(); if (!t) return;
      const r = await fetch(SB + "/functions/v1/account", { method: "POST", headers: { "Content-Type": "application/json", apikey: AI_KEY, Authorization: "Bearer " + t }, body: JSON.stringify({ action: "delete_me", password: pw.value }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { authMode = "signup"; authErr = "اتحذف حسابك."; await logout(true); } else toast(j.error || "حصل خطأ");
    } catch (e) { toast("مفيش اتصال بالنت"); }
    btn.disabled = false;
  } }, "حذف حسابي نهائيًا");
  return h("div", { class: "card" }, h("h3", {}, "حذف الحساب"), h("p", { class: "muted" }, "بيمسح حسابك وكل بياناتك من السيرفر وبيرجّعك لشاشة التسجيل."), h("div", { class: "inl" }, pw, btn));
}
const annBox = h("div", { id: "ann" });
async function loadAnn() {
  try {
    const row = (await (await fetch(SB + "/rest/v1/unimate_announcements?select=id,message&active=eq.true&order=created_at.desc&limit=1", { headers: { apikey: AI_KEY } })).json())[0];
    let seen = ""; try { seen = localStorage.getItem("unimate-ann") || ""; } catch (e) {}
    if (!row || row.id === seen) return annBox.replaceChildren();
    annBox.replaceChildren(h("div", { class: "ann", role: "status" }, h("span", {}, row.message),
      h("button", { type: "button", "aria-label": "إغلاق الإعلان", onclick: () => { try { localStorage.setItem("unimate-ann", row.id); } catch (e) {} annBox.replaceChildren(); } }, "✕")));
  } catch (e) {}
}
function pwCard() {
  const np = h("input", { type: "password", dir: "auto", autocomplete: "new-password", minlength: 6, placeholder: "كلمة مرور جديدة (6 حروف على الأقل)", "aria-label": "كلمة مرور جديدة" });
  const btn = h("button", { class: "sm", onclick: async () => {
    if (np.value.length < 6) return toast("كلمة المرور لازم تكون 6 حروف على الأقل");
    btn.disabled = true;
    try {
      const t = await getTok(); if (!t) return;
      const r = await fetch(SB + "/auth/v1/user", { method: "PUT", headers: { "Content-Type": "application/json", apikey: AI_KEY, Authorization: "Bearer " + t }, body: JSON.stringify({ password: np.value }) });
      if (r.ok) { np.value = ""; toast("اتغيّرت كلمة المرور"); } else toast(authMsg(await r.json().catch(() => ({})), r.status));
    } catch (e) { toast("مفيش اتصال بالنت"); }
    btn.disabled = false;
  } }, "حفظ");
  return h("div", { class: "card" }, h("h3", {}, "تغيير كلمة المرور"), h("div", { class: "inl" }, np, btn));
}
let verified = false; try { verified = localStorage.getItem("unimate-verified") === "1"; } catch (e) {}
function setVerified(v) { const ch = v !== verified; verified = v; try { v ? localStorage.setItem("unimate-verified", "1") : localStorage.removeItem("unimate-verified"); } catch (e) {} return ch; }
const vBadge = () => verified ? h("span", { class: "vbadge", title: "حساب موثّق", role: "img", "aria-label": "حساب موثّق" }, "✓") : null;
async function refreshVerified() {
  const a = auth.get(); if (!a) return;
  try { const r = await rest("unimate_profiles?select=verified&user_id=eq." + a.uid); if (!r.ok) return;
    const row = (await r.json())[0]; if (row && setVerified(!!row.verified)) render(); } catch (e) {}
}
async function cloudBoot() {
  const a = auth.get(); if (!a) return;
  refreshVerified(); checkAccount();
  const r = await rest("unimate_user_data?select=payload&user_id=eq." + a.uid); if (!r.ok) return;
  const c = ((await r.json())[0] || {}).payload;
  if (c && (c._u || 0) > (S._u || 0)) { try { localStorage.setItem(KEY + "-bak", JSON.stringify(S)); localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} S = c; render(); }
  else await cloudPush();
}
async function logout(forced) {
  try { if (!forced && auth.get()) await cloudPush(); } catch (e) {}
  try { localStorage.setItem(KEY + "-bak", JSON.stringify(S)); localStorage.removeItem(KEY); } catch (e) {}
  auth.set(null); setVerified(false); S = { profile: null, subjects: [], exams: [], classes: [], done: {} }; tab = "home"; tReset(); render();
}
function renderForgot() {
  moreOpen = false; $("more").hidden = true; $("nav").hidden = true;
  const un = h("input", { id: "fu", type: "text", dir: "auto", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, maxlength: 21, placeholder: "اسم المستخدم", value: authUser });
  const ct = h("input", { id: "fc", type: "tel", dir: "auto", autocomplete: "tel", required: true, maxlength: 20, placeholder: "رقم واتساب (مثال 01012345678)" });
  const msg = h("div", { class: "auth-err", role: "alert", hidden: true });
  const go = h("button", { type: "submit", class: "auth-go" }, "إرسال الطلب");
  const say = (t, ok) => { msg.textContent = t; msg.style.cssText = ok ? "background:color-mix(in srgb,var(--mint) 14%,transparent);color:var(--mint)" : ""; msg.hidden = false; };
  const form = h("form", { onsubmit: async e => {
    e.preventDefault(); msg.hidden = true;
    const u = un.value.trim().toLowerCase().replace(/^@/, ""), c = ct.value.trim();
    if (!validUser(u)) return say("اكتب اسم المستخدم صح.");
    if (!/^\+?[0-9\s-]{8,16}$/.test(c)) return say("اكتب رقم واتساب صحيح.");
    go.disabled = true; go.textContent = "ثواني…";
    try {
      const r = await fetch(SB + "/rest/v1/unimate_messages", { method: "POST", headers: { "Content-Type": "application/json", apikey: AI_KEY, Prefer: "return=minimal" }, body: JSON.stringify({ username: u, kind: "password", body: "نسيت كلمة المرور", contact: c }) });
      if (r.ok) { say("اتبعت طلبك ✓ الأدمن هيكلمك على الواتساب بكلمة مرور مؤقتة.", true); go.hidden = true; return; }
      say("مقدرناش نبعت الطلب دلوقتي، جرّب بعد شوية.");
    } catch (x) { say("مفيش اتصال بالنت."); }
    go.disabled = false; go.textContent = "إرسال الطلب";
  } },
    h("div", { class: "auth-f" }, h("label", { for: "fu" }, "اسم المستخدم"), un),
    h("div", { class: "auth-f" }, h("label", { for: "fc" }, "رقم الواتساب للتواصل"), ct, h("small", {}, "هنكلمك عليه بكلمة مرور مؤقتة. الرقم بيوصل للأدمن بس.")),
    msg, go);
  $("view").replaceChildren(h("div", { class: "auth-wrap" }, h("div", { class: "auth-card" },
    h("div", { class: "auth-head" }, h("span", { class: "logo" }, "U"), h("h2", {}, "نسيت كلمة المرور"), h("p", {}, "ابعت طلب للأدمن وهيساعدك تدخل تاني")),
    h("div", { class: "auth-body" }, form, h("button", { type: "button", class: "ghost", style: "width:100%;margin-top:14px", onclick: () => { authMode = "login"; renderAuth(); } }, "رجوع لتسجيل الدخول")))));
}
let authMode = "login", authErr = "", authUser = "";
function renderAuth() {
  if (authMode === "forgot") return renderForgot();
  moreOpen = false; $("more").hidden = true; $("nav").hidden = true;
  const login = authMode === "login", HINT = "من 3 لـ 20 حرف: إنجليزي وأرقام و _ . وفيه حرف واحد على الأقل (مثال: ahmed_22)";
  const em = h("input", { id: "au", type: "text", dir: "auto", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, maxlength: 21, placeholder: "اسم المستخدم", value: authUser, "aria-describedby": "au-h" });
  const hint = h("small", { id: "au-h", "aria-live": "polite", hidden: login }, login ? "" : HINT);
  const upd = () => { authUser = em.value; if (login) return; const u = em.value.trim().toLowerCase().replace(/^@/, ""); hint.className = !u ? "" : validUser(u) ? "ok" : "bad"; hint.textContent = !u ? HINT : validUser(u) ? "✓ اسم مناسب" : HINT; };
  em.addEventListener("input", upd); if (authUser) upd();
  const pw = h("input", { id: "ap", type: "password", dir: "auto", autocomplete: login ? "current-password" : "new-password", required: true, minlength: 6, placeholder: "كلمة المرور", "aria-describedby": "ap-h" });
  const pwHint = h("small", { id: "ap-h", "aria-live": "polite", hidden: login }, "6 حروف على الأقل");
  pw.addEventListener("input", () => { const n = pw.value.length; pwHint.className = !n ? "" : n >= 6 ? "ok" : "bad"; pwHint.textContent = n >= 6 ? "✓ كلمة مرور مناسبة" : "6 حروف على الأقل"; });
  const eye = h("button", { type: "button", "aria-label": "إظهار أو إخفاء كلمة المرور", onclick: () => { const sh = pw.type === "password"; pw.type = sh ? "text" : "password"; eye.textContent = sh ? "إخفاء" : "إظهار"; } }, "إظهار");
  const err = h("div", { class: "auth-err", role: "alert", hidden: !authErr }, authErr);
  const go = h("button", { type: "submit", class: "auth-go" }, login ? "دخول" : "إنشاء حساب");
  const form = h("form", { onsubmit: async e => {
    e.preventDefault(); go.disabled = true; go.textContent = "ثواني…"; err.hidden = true;
    try {
      const id = login ? toId(em.value) : (validUser(em.value.trim().toLowerCase().replace(/^@/, "")) ? toId(em.value) : null);
      if (!id) throw new Error(login ? "اكتب اسم المستخدم بتاعك." : "اسم المستخدم من 3 لـ 20 حرف: إنجليزي وأرقام و _ . وفيه حرف واحد على الأقل.");
      const j = await authReq(login ? "token?grant_type=password" : "signup", { email: id, password: pw.value });
      if (!j.access_token) { authMode = "login"; authErr = "التسجيل مش متاح دلوقتي، جرّب بعد شوية."; renderAuth(); return; }
      saveSess(j); authErr = ""; authUser = ""; render(); cloudBoot().catch(() => {});
    } catch (x) { err.textContent = x.message === "Failed to fetch" ? "مفيش اتصال بالنت." : x.message; err.hidden = false; go.disabled = false; go.textContent = login ? "دخول" : "إنشاء حساب"; }
  } },
    h("div", { class: "auth-f" }, h("label", { for: "au" }, "اسم المستخدم"), em, hint),
    h("div", { class: "auth-f" }, h("label", { for: "ap" }, "كلمة المرور"), h("div", { class: "pw" }, pw, eye), pwHint),
    err, go, login && h("button", { type: "button", class: "auth-forgot-btn", onclick: () => { authMode = "forgot"; authErr = ""; renderAuth(); } }, "نسيت كلمة المرور؟"),
    h("div", { class: "auth-foot" }, h("span", {}, "🔄 مزامنة بين كل أجهزتك"), h("span", {}, "🔒 بياناتك محفوظة على حسابك")));
  const seg = h("div", { class: "seg", role: "group", "aria-label": "دخول أو حساب جديد" }, [["login", "دخول"], ["signup", "حساب جديد"]].map(([k, l]) =>
    h("button", { type: "button", class: "ghost sm" + (authMode === k ? " on" : ""), "aria-pressed": String(authMode === k), onclick: () => { if (authMode !== k) { authMode = k; authErr = ""; renderAuth(); } } }, l)));
  $("view").replaceChildren(h("div", { class: "auth-wrap" }, h("div", { class: "auth-card" },
    h("div", { class: "auth-head" }, h("span", { class: "logo" }, "U"), h("h2", {}, "UniMate AI"), h("p", {}, "مساعدك الجامعي الذكي")),
    h("div", { class: "auth-body" }, seg, form))));
  if (matchMedia("(min-width:900px)").matches) setTimeout(() => em.focus());
}
let S = store.load() || { profile: null, subjects: [], exams: [], classes: [], done: {} };
let tab = "home", plotSel = null, treeFocus = null;
let syncT; const commit = () => { store.save(S); render(); if (S.notifOn) { clearTimeout(syncT); syncT = setTimeout(() => syncNotif(), 1500); } };
