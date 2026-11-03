/* ---------- ما يفوتكش كويز: إضافة سريعة + تقويم + تذكير مسائي ---------- */
function dlFile(name, text, type) { const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); }
function exportIcs(e) {
  const nm = (((subj(e.sid) || {}).name || "") + " " + (e.kind || "")).trim() || "امتحان", esc = t => String(t).replace(/[\\;,]/g, m => "\\" + m);
  const d = e.date.replace(/-/g, ""), al = (trig, t) => "BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:" + esc(t) + "\r\nTRIGGER:" + trig + "\r\nEND:VALARM";
  let when, alarms;
  if (e.time) { const hh = e.time.slice(0, 2), mm = e.time.slice(3, 5), h2 = String((+hh + 1) % 24).padStart(2, "0"); when = "DTSTART:" + d + "T" + hh + mm + "00\r\nDTEND:" + d + "T" + h2 + mm + "00"; alarms = [al("-PT1440M", "بكرة: " + nm), al("-PT120M", "بعد ساعتين: " + nm), al("-PT30M", "بعد نص ساعة: " + nm)]; }
  else { const nx = new Date(e.date + "T00:00:00"); nx.setDate(nx.getDate() + 1); when = "DTSTART;VALUE=DATE:" + d + "\r\nDTEND;VALUE=DATE:" + iso(nx).replace(/-/g, ""); alarms = [al("-P2DT15H", "كمان 3 أيام: " + nm), al("-PT900M", "بكرة: " + nm), al("PT480M", "النهاردة: " + nm)]; }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  dlFile("exam-" + e.date + ".ics", ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniMate//AR", "BEGIN:VEVENT", "UID:" + e.id + "@unimate", "DTSTAMP:" + stamp, when, "SUMMARY:" + esc(nm), ...alarms, "END:VEVENT", "END:VCALENDAR"].join("\r\n"), "text/calendar");
  toast("افتح الملف وأضفه للتقويم، هيرنّ لك قبل الموعد 📅");
}
const EX_KINDS = ["كويز", "ميد", "فاينال", "تسليم", "سكشن"];
const PX = { text: "", busy: false, msg: "", items: [] };
const parseObjs = t => { let a = []; try { a = JSON.parse((t.match(/\[[\s\S]*\]/) || ["[]"])[0]); } catch (e) { a = (t.match(/\{[^{}]*\}/g) || []).map(o => { try { return JSON.parse(o); } catch (x) { return null; } }); } return Array.isArray(a) ? a.filter(x => x && typeof x === "object") : []; };
function resolveDate(x) {
  const td = iso(new Date());
  if (/^\d{4}-\d{2}-\d{2}$/.test(x.date || "")) { let d = x.date; const y = new Date().getFullYear(); if (d < td) d = y + d.slice(4); if (d < td) d = (y + 1) + d.slice(4); return d; }
  if (x.rel === "today") return td; if (x.rel === "tomorrow") return addDays(1); if (x.rel === "after_tomorrow") return addDays(2);
  if (Number.isInteger(x.weekday) && x.weekday >= 0 && x.weekday <= 6) { let n = (x.weekday - new Date().getDay() + 7) % 7; if (n === 0) n = 7; return addDays(n); }
  return "";
}
const matchSubject = n => { n = String(n || "").trim().toLowerCase(); if (!n) return ""; const m = S.subjects.find(x => { const a = x.name.toLowerCase(); return a === n || a.includes(n) || n.includes(a); }); return m ? m.id : ""; };
const fmtDay = d => new Date(d + "T00:00:00").toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "numeric" });
function pasteCard() {
  const ta = h("textarea", { rows: 3, maxlength: 1000, placeholder: "انسخ رسالة الجروب أو الدكتور هنا، مثال: «كويز تفاضل الثلاثاء الساعة 10»", "aria-label": "رسالة الموعد", oninput: e => { PX.text = e.target.value; } }, PX.text);
  const btn = h("button", { class: "sm", disabled: PX.busy, onclick: async () => {
    const t = PX.text.trim(); if (t.length < 6) return toast("الصق الرسالة الأول");
    PX.busy = true; PX.msg = ""; PX.items = []; render();
    try {
      const out = await aiAsk("بتستخرج مواعيد كويزات وامتحانات وتسليمات من رسالة طالب (جروب واتساب أو دكتور). النهاردة: " + new Date().toLocaleDateString("ar-EG", { weekday: "long" }) + " " + iso(new Date()) + ".\nموادي: " + (S.subjects.map(x => x.name).join("، ") || "مفيش") + ".\nرجّع JSON array بس من غير أي كلام تاني، كل عنصر: {\"kind\":\"كويز|ميد|فاينال|تسليم|سكشن\",\"subject\":\"اسم المادة من قايمتي لو متطابق وإلا ''\",\"date\":\"YYYY-MM-DD لو الرسالة ذكرت تاريخ صريح وإلا ''\",\"weekday\":رقم 0 لـ 6 (0=الأحد) لو ذكرت اسم يوم وإلا -1,\"rel\":\"today أو tomorrow أو after_tomorrow لو قال النهاردة/بكرة/بعد بكرة وإلا ''\",\"time\":\"HH:MM بنظام 24 ساعة لو ذكرت ساعة وإلا ''\"}. لو مفيش موعد رجّع [].\n\nالرسالة:\n" + t.slice(0, 900));
      PX.items = parseObjs(out).slice(0, 5).map(x => ({ kind: EX_KINDS.includes(x.kind) ? x.kind : "كويز", sid: matchSubject(x.subject), date: resolveDate(x), time: /^([01]\d|2[0-3]):[0-5]\d$/.test(x.time || "") ? x.time : "" }));
      PX.msg = PX.items.length ? "لقيت " + PX.items.length + (PX.items.length > 1 ? " مواعيد" : " موعد") + ". دوس عليه عشان يتحط في الفورم اللي تحت، وراجعه قبل ما تضيف." : "مالقيتش موعد في الرسالة. اكتبه يدوي من الفورم اللي تحت.";
    } catch (e) { PX.msg = e.message; }
    PX.busy = false; render();
  } }, PX.busy ? "ثواني…" : "طلّع الموعد");
  return h("div", { class: "card" }, h("h3", {}, "الصق رسالة الموعد ✨"), h("p", { class: "muted" }, "أسرع من التسجيل اليدوي. (بتحسب من حد رسائل المساعد)"), ta, h("div", { class: "inl", style: "margin-top:8px" }, btn),
    PX.msg ? h("p", { class: "note" }, PX.msg) : null,
    PX.items.map(it => h("button", { type: "button", class: "ghost", style: "display:block;width:100%;text-align:start;margin-top:8px", onclick: () => { examSt.kind = it.kind; examSt.sid = it.sid; if (it.date) examSt.date = it.date; examSt.time = it.time; PX.msg = it.date ? "اتحط في الفورم تحت. راجع التاريخ والساعة واضغط إضافة." : "التاريخ مش واضح في الرسالة، حدّده من الفورم تحت."; render(); const f = document.querySelector("#view form.card:not(.x)"); f && f.scrollIntoView({ behavior: "smooth", block: "center" }); } },
      it.kind + ((S.subjects.find(x => x.id === it.sid) || {}).name ? " " + S.subjects.find(x => x.id === it.sid).name : "") + " — " + (it.date ? fmtDay(it.date) : "التاريخ مش واضح") + (it.time ? " • " + it.time : ""))));
}
const examSt = { kind: "كويز", date: "", time: "", sid: "", place: "", note: "", share: "", subjText: "" };
const B = { mine: [], events: [], at: 0, busy: false, msg: "" };
const BERR = { not_found: "الكود ده مش موجود. اتأكد منه.", batch_full: "المجموعة دي اتملت.", too_many_batches: "وصلت للحد الأقصى (5 مجموعات).", too_many_events: "وصلت للحد اليومي من إضافة المواعيد.", batch_events_full: "المجموعة دي وصلت للحد الأقصى من المواعيد.", bad_name: "اكتب اسم من حرفين على الأقل." };
async function rpc(fn, args) { const r = await rest("rpc/" + fn, { method: "POST", body: JSON.stringify(args) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(BERR[(j.message || "").trim()] || "حصل خطأ، جرّب تاني."); return j; }
async function loadBatches(force) {
  if (!auth.get() || B.busy || (!force && Date.now() - B.at < 30000)) return; B.busy = true;
  try {
    const m = await (await rest("unimate_batch_members?select=batch_code,role,unimate_batches(name)")).json();
    B.mine = Array.isArray(m) ? m.map(x => ({ code: x.batch_code, role: x.role, name: (x.unimate_batches || {}).name || x.batch_code })) : [];
    const ev = B.mine.length ? await (await rest("unimate_batch_events?select=*&date=gte." + addDays(-1) + "&order=date.asc,time.asc&limit=200")).json() : [];
    B.events = Array.isArray(ev) ? ev : []; B.at = Date.now();
    if (S.notifOn) syncNotif();
    if (tab === "home" || (tab === "study" && secs.study === "exams")) render();
  } catch (e) {}
  B.busy = false;
}
function joinBlock(act) {
  const code = h("input", { type: "text", dir: "ltr", maxlength: 12, placeholder: "كود الدفعة (6 حروف)", "aria-label": "كود الدفعة", autocapitalize: "characters" });
  const name = h("input", { type: "text", maxlength: 60, placeholder: "اسم الدفعة (مثال: هندسة سنة تانية)", "aria-label": "اسم الدفعة" });
  return [h("div", { class: "inl" }, code, h("button", { class: "sm", onclick: () => code.value.trim() && act(() => rpc("unimate_join_batch", { p_code: code.value }), "انضميت للمجموعة ✓") }, "انضم")),
    h("div", { class: "inl", style: "margin-top:8px" }, name, h("button", { class: "sm ghost", onclick: () => name.value.trim() && act(() => rpc("unimate_create_batch", { p_name: name.value }), "اتعملت المجموعة ✓ ابعت الكود لزمايلك") }, "اعمل مجموعة"))];
}
function batchCard() {
  if (!auth.get()) return null;
  loadBatches();
  const act = async (fn, ok) => { B.msg = ""; try { await fn(); B.msg = ok; await loadBatches(true); } catch (e) { B.msg = e.message; } render(); };
  const msg = B.msg ? h("p", { class: "note" }, B.msg) : null;
  if (!B.mine.length) return h("div", { class: "card" }, h("h3", {}, "تقويم الدفعة 👥"), h("p", { class: "muted" }, "لو أي حد من دفعتك ضاف كويز، يظهر عند كلكم وتتنبّهوا بيه. اتفقوا على مجموعة واحدة."), joinBlock(act), msg);
  const today = iso(new Date()), up = B.events.filter(e => e.date >= today), roleOf = c => (B.mine.find(m => m.code === c) || {}).role, nameOf = c => (B.mine.find(m => m.code === c) || {}).name || "";
  return h("div", { class: "card" }, h("h3", {}, "تقويم الدفعة 👥"), msg,
    B.mine.map(m => h("div", { class: "brow" }, h("span", {}, m.name + " • الكود: " + m.code), h("div", { class: "inl" },
      h("button", { class: "ghost sm", onclick: async () => { try { await navigator.clipboard.writeText(m.code); toast("اتنسخ الكود"); } catch (e) { toast(m.code); } } }, "نسخ"),
      h("button", { class: "ghost sm", onclick: async () => { if (await sure("تخرج من «" + m.name + "»؟")) act(async () => { const r = await rest("unimate_batch_members?batch_code=eq." + m.code + "&user_id=eq." + auth.get().uid, { method: "DELETE" }); if (!r.ok) throw new Error("حصل خطأ"); }, "خرجت من المجموعة"); } }, "خروج")))),
    up.length ? up.map(ev => h("div", { class: "msg" }, h("b", {}, ev.kind + (ev.subject ? " " + ev.subject : "")),
      h("p", { class: "muted", style: "margin:2px 0" }, fmtDay(ev.date) + (ev.time ? " • " + ev.time : "") + (ev.place ? " • " + ev.place : "") + (B.mine.length > 1 ? " • " + nameOf(ev.batch_code) : "")),
      ev.note ? h("p", { style: "margin:2px 0" }, "🎒 " + ev.note) : null,
      ev.created_by === auth.get().uid || roleOf(ev.batch_code) === "owner" ? h("button", { class: "ghost sm", onclick: async () => { if (await sure("تمسح الموعد ده من الدفعة كلها؟")) act(async () => { const r = await rest("unimate_batch_events?id=eq." + ev.id, { method: "DELETE" }); if (!r.ok) throw new Error("حصل خطأ"); }, "اتمسح الموعد"); } }, "مسح") : null))
      : h("p", { class: "muted" }, "مفيش مواعيد للدفعة لسه. أضف أول واحد من الفورم اللي تحت واختار مشاركته مع الدفعة."),
    h("details", { class: "nb" }, h("summary", {}, "انضم أو اعمل مجموعة تانية"), joinBlock(act)));
}
function examForm() {
  const f = examSt; if (!f.date) f.date = addDays(1);
  const chip = (t, on, fn) => h("button", { type: "button", class: "ghost sm" + (on ? " on" : ""), "aria-pressed": String(on), onclick: fn }, t);
  const sel = h("select", { "aria-label": "المادة", onchange: e => { f.sid = e.target.value; render(); } }, h("option", { value: "" }, "مادة غير محددة"), S.subjects.map(x => h("option", { value: x.id, selected: x.id === f.sid }, x.name)));
  const dI = h("input", { type: "date", value: f.date, "aria-label": "التاريخ", onchange: e => { f.date = e.target.value; render(); } });
  const tI = h("input", { type: "time", value: f.time, "aria-label": "الساعة (اختياري)", onchange: e => { f.time = e.target.value; } });
  const place = h("input", { type: "text", maxlength: 80, placeholder: "المكان (قاعة / معمل) — اختياري", value: f.place, "aria-label": "المكان", oninput: e => { f.place = e.target.value; } });
  const note = h("input", { type: "text", maxlength: 200, placeholder: "هتحتاج إيه؟ (آلة حاسبة، كارنيه…) — اختياري", value: f.note, "aria-label": "الأدوات المطلوبة", oninput: e => { f.note = e.target.value; } });
  const shareSel = B.mine.length ? h("select", { "aria-label": "المشاركة", onchange: e => { f.share = e.target.value; render(); } }, h("option", { value: "" }, "مواعيدي أنا بس"), B.mine.map(m => h("option", { value: m.code, selected: f.share === m.code }, "شاركه مع «" + m.name + "»"))) : null;
  const subjT = f.share && !f.sid ? h("input", { type: "text", maxlength: 60, placeholder: "اسم المادة (عشان زمايلك يعرفوه)", value: f.subjText, "aria-label": "اسم المادة", oninput: e => { f.subjText = e.target.value; } }) : null;
  const reset = () => { f.time = ""; f.date = ""; f.place = ""; f.note = ""; f.subjText = ""; };
  const submit = async e => {
    e.preventDefault(); if (!f.date) return toast("اختار التاريخ");
    if (f.share) {
      const nm = ((S.subjects.find(x => x.id === f.sid) || {}).name || f.subjText).trim().slice(0, 60);
      try {
        const r = await rest("unimate_batch_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ batch_code: f.share, kind: f.kind, subject: nm, date: f.date, time: f.time || null, place: f.place.trim() || null, note: f.note.trim() || null, created_by: auth.get().uid }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); return toast(BERR[(j.message || "").trim()] || "مقدرناش نضيفه للدفعة"); }
      } catch (x) { return toast("مفيش اتصال بالنت"); }
      toast("اتضاف للدفعة ✓ كلهم هيتنبّهوا بيه"); reset(); await loadBatches(true); render(); return;
    }
    S.exams.push({ id: uid(), sid: f.sid, date: f.date, kind: f.kind, ...(f.time ? { time: f.time } : {}), ...(f.place.trim() ? { place: f.place.trim() } : {}), ...(f.note.trim() ? { note: f.note.trim() } : {}) });
    reset(); commit(); toast("اتضاف ✓ دوس 📅 تحت عشان يرنّ لك التقويم");
  };
  return h("div", {}, pasteCard(), batchCard(), h("form", { class: "card", onsubmit: submit },
      h("h3", {}, "كويز أو امتحان أو تسليم جديد"),
      h("div", { class: "seg subtabs" }, EX_KINDS.map(k => chip(k, f.kind === k, () => { f.kind = k; render(); }))),
      h("div", { class: "seg subtabs" }, [["النهاردة", 0], ["بكرة", 1], ["بعد 3 أيام", 3], ["أسبوع", 7]].map(([t, n]) => chip(t, f.date === addDays(n), () => { f.date = addDays(n); render(); }))),
      h("div", { class: "inl" }, dI, tI), place, note, sel, shareSel, subjT, h("button", { type: "submit", style: "margin-top:8px" }, f.share ? "أضف للدفعة" : "إضافة")),
    S.exams.length && !S.notifOn ? h("div", { class: "card" }, h("h3", {}, "متفوّتش موعد تاني 🔔"), h("p", { class: "muted" }, "فعّل تنبيهات الموبايل، أو دوس 📅 على أي موعد يتضاف لتقويم موبايلك ويرنّ لك قبلها (وبيشتغل على أي موبايل)."), pushReady() && !(isIOS && !navigator.standalone) ? h("button", { class: "sm", onclick: enablePush }, "فعّل التنبيهات") : null) : null);
}
function soonEvents(key) {
  const out = [], tm = addDays(1);
  const add = (id, name, kind, date, time, place, note) => { if (date === key || date === tm) out.push({ id: id + ":" + date, name, kind, date, time, place, note, dl: date === key ? 0 : 1 }); };
  S.exams.forEach(e => add(e.id, (subj(e.sid) || {}).name || "", e.kind || "امتحان", e.date, e.time, e.place, e.note));
  B.events.forEach(ev => add("g" + ev.id, ev.subject || "", ev.kind, ev.date, ev.time, ev.place, ev.note));
  return out.sort((a, b) => a.dl - b.dl);
}
