/* ---------- مراجعة متباعدة + دفتر أخطاء + اشرحها بكلامك ---------- */
const LADDER = [1, 3, 7, 14, 30, 60];
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const cardsOf = () => S.cards || (S.cards = []);
const dueCards = () => { const t = iso(new Date()); return cardsOf().filter(c => c.due <= t); };
function addCard(c) { if (cardsOf().some(x => x.q === c.q)) return false; cardsOf().push({ id: uid(), stage: 0, due: addDays(c.src === "wrong" ? 2 : 1), ...c }); return true; }
function rateCard(c, r) { if (r === 0) c.stage = 0; else if (r === 2) c.stage = Math.min(c.stage + 1, LADDER.length - 1); c.due = addDays(r === 0 ? 1 : LADDER[c.stage]); }
const weakList = n => Object.entries(S.weak || {}).filter(([, e]) => e.t >= 2 && e.w / e.t >= .4).sort((a, b) => b[1].w / b[1].t - a[1].w / a[1].t).slice(0, n);
function recordQuiz(kind) {
  if (kind === "mcq") track("quiz");
  const z = Q.quiz; if (!z) return; const sid = (S.subjects.find(x => x.name === Q.subj) || {}).id;
  z.questions.forEach((x, i) => {
    if ((x.type === "mcq") !== (kind === "mcq")) return;
    const ok = kind === "mcq" ? Q.ans[i] === x.answer : ((Q.review && (Q.review.items.find(r => r.index === i) || {}).score) || 0) >= 1;
    const t = x.topic || "عام", e = ((S.weak = S.weak || {})[t] = S.weak[t] || { w: 0, t: 0 }); e.t++; if (!ok) e.w++;
    if (!ok) addCard({ q: x.q, a: kind === "mcq" ? x.options[x.answer] + (x.explanation ? " — " + x.explanation : "") : x.model_answer, topic: t, sid, src: "wrong" });
  });
  store.save(S);
}
async function aiAsk(prompt) {
  const r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: AI_KEY, Authorization: "Bearer " + ((await getTok()) || AI_KEY) }, body: JSON.stringify({ messages: [{ role: "user", content: prompt }], context: {} }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("سجّل دخول الأول.");
  if (r.status === 429) throw new Error(j.error === "daily_limit" ? "وصلت للحد اليومي من رسائل المساعد. هيتجدد بكرة." : "الطلبات كتير دلوقتي، جرّب بعد شوية.");
  if (!r.ok || !j.text) throw new Error("المساعد مش متاح حاليًا. جرّب تاني بعد شوية.");
  return j.text;
}
function parseCards(t) {
  let arr = []; try { arr = JSON.parse((t.match(/\[[\s\S]*\]/) || [""])[0]); } catch (e) { arr = (t.match(/\{[^{}]*\}/g) || []).map(o => { try { return JSON.parse(o); } catch (x) { return null; } }); }
  return (Array.isArray(arr) ? arr : []).filter(c => c && typeof c.q === "string" && typeof c.a === "string" && c.q.trim() && c.a.trim()).map(c => ({ q: c.q.trim().slice(0, 300), a: c.a.trim().slice(0, 400), topic: String(c.topic || "").slice(0, 40) }));
}
const RV = { queue: null, i: 0, flip: false, busy: false, msg: "", ex: { t: "", s: "", out: "", busy: false } };
const startReview = () => { RV.queue = dueCards().sort(() => Math.random() - .5); RV.i = 0; RV.flip = false; };
function reviewRun() {
  if (RV.i >= RV.queue.length) { const n = RV.queue.length; return h("div", { class: "card" }, h("h3", {}, "خلّصت مراجعة النهاردة 🎉"), h("p", { class: "muted" }, n + " كروت — هتظهر تاني في مواعيدها."), h("button", { onclick: () => { RV.queue = null; render(); } }, "تمام")); }
  const c = RV.queue[RV.i], rt = r => { rateCard(c, r); store.save(S); if (S.notifOn) { clearTimeout(syncT); syncT = setTimeout(() => syncNotif(), 4000); } RV.i++; RV.flip = false; render(); };
  return h("div", { class: "card rv" }, h("p", { class: "muted" }, (RV.i + 1) + " / " + RV.queue.length + (c.topic ? " • " + c.topic : "")), h("h3", { style: "white-space:pre-wrap" }, c.q),
    RV.flip ? h("div", {}, h("p", { class: "ans ok", style: "white-space:pre-wrap" }, c.a), h("div", { class: "inl" }, h("button", { class: "ghost", onclick: () => rt(0) }, "نسيت"), h("button", { class: "ghost", onclick: () => rt(1) }, "صعب"), h("button", { onclick: () => rt(2) }, "سهل")))
      : h("div", {}, h("p", { class: "muted" }, "فكّر في الإجابة الأول، وبعدين اعرضها."), h("button", { onclick: () => { RV.flip = true; render(); } }, "اعرض الإجابة")));
}
function genCard() {
  const sel = h("select", { "aria-label": "المادة" }, h("option", { value: "" }, "مادة عامة"), S.subjects.map(x => h("option", { value: x.id }, x.name)));
  const ta = h("textarea", { rows: 4, maxlength: 6000, placeholder: "الصق هنا جزء من مادتك (ملاحظات، ملخص، فقرة من الكتاب)…", "aria-label": "المادة" });
  const btn = h("button", { class: "sm", disabled: RV.busy, onclick: async () => {
    const t = ta.value.trim(); if (t.length < 80) return toast("الصق نص أطول شوية (80 حرف على الأقل)");
    RV.busy = true; RV.msg = "بيطلّع الكروت…"; render();
    try {
      const out = parseCards(await aiAsk("طلّع من النص ده 8 كروت مراجعة (سؤال وجواب قصير ومحدد) بنفس لغة النص. رجّع JSON بس من غير أي كلام تاني: [{\"q\":\"السؤال\",\"a\":\"الجواب في جملة أو اتنين\",\"topic\":\"الموضوع في كلمتين\"}]\n\nالنص:\n" + t.slice(0, 5000)));
      const n = out.filter(c => addCard({ ...c, sid: sel.value || undefined, src: "ai" })).length; store.save(S);
      RV.msg = n ? "اتضافت " + n + " كروت. هتظهر لك في مراجعة بكرة." : "معرفتش أطلّع كروت كويسة. جرّب نص أوضح.";
    } catch (e) { RV.msg = e.message; }
    RV.busy = false; render();
  } }, RV.busy ? "ثواني…" : "طلّع كروت");
  return h("div", { class: "card" }, h("h3", {}, "كروت من مادتك"), h("p", { class: "muted" }, "الصق نص والمساعد يحوّله لكروت سؤال/جواب. (بتحسب من حد رسائل المساعد)"), sel, ta, h("div", { class: "inl", style: "margin-top:8px" }, btn), RV.msg ? h("p", { class: "note" }, RV.msg) : null);
}
function weakCard() {
  const w = weakList(6), wrong = cardsOf().filter(c => c.src === "wrong");
  return h("div", { class: "card" }, h("h3", {}, "دفتر الأخطاء ونقط الضعف"),
    w.length ? h("div", { class: "rv-tags" }, w.map(([t, e]) => h("span", {}, t + " (" + e.w + "/" + e.t + " غلط)"))) : h("p", { class: "muted" }, "لما تحل اختبارات «اختبرني» هنسجّل هنا المواضيع اللي بتغلط فيها وأسئلتك الغلط، وهنراجعها معاك بعد يومين وأسبوع."),
    wrong.slice(-8).reverse().map(c => h("details", { class: "nb" }, h("summary", {}, c.q), h("p", { style: "white-space:pre-wrap" }, c.a), h("button", { class: "ghost sm", onclick: () => { S.cards = cardsOf().filter(x => x.id !== c.id); store.save(S); render(); } }, "مسحت الغلطة دي"))));
}
function explainCard() {
  const t = h("input", { type: "text", maxlength: 80, placeholder: "اسم الموضوع", value: RV.ex.t, "aria-label": "الموضوع", oninput: e => { RV.ex.t = e.target.value; } });
  const s = h("textarea", { rows: 4, maxlength: 1500, placeholder: "اشرحه بكلامك كأنك بتعلّمه لزميلك…", "aria-label": "شرحك", oninput: e => { RV.ex.s = e.target.value; } }, RV.ex.s);
  const btn = h("button", { class: "sm", disabled: RV.ex.busy, onclick: async () => {
    if (RV.ex.t.trim().length < 2 || RV.ex.s.trim().length < 40) return toast("اكتب الموضوع وشرح أطول شوية");
    RV.ex.busy = true; RV.ex.out = ""; render();
    try { RV.ex.out = await aiAsk("الطالب بيشرح موضوع «" + RV.ex.t.trim() + "» بكلامه:\n" + RV.ex.s.trim() + "\n\nقيّم شرحه بالعامية المصرية وباختصار: (1) إيه الصح فيه (2) إيه الناقص أو الغلط (3) تصحيح في جملة لو فيه غلط. من غير نصائح مذاكرة عامة."); }
    catch (e) { RV.ex.out = e.message; }
    RV.ex.busy = false; render();
  } }, RV.ex.busy ? "ثواني…" : "قيّم شرحي");
  return h("div", { class: "card" }, h("h3", {}, "اشرحها بكلامك"), h("p", { class: "muted" }, "لو قدرت تشرح الموضوع من غير ما تبص في الكتاب، يبقى فهمته فعلاً. (بتحسب من حد رسائل المساعد)"), t, s, h("div", { class: "inl", style: "margin-top:8px" }, btn), RV.ex.out ? h("div", { class: "note", style: "white-space:pre-wrap" }, RV.ex.out) : null);
}
function reviewView() {
  const due = dueCards(), n = cardsOf().length;
  return h("div", {}, head("مراجعة", "اسأل نفسك بدل ما تعيد القراءة — أقوى طريقة للحفظ."),
    RV.queue ? reviewRun() : h("div", { class: "card" }, h("h3", {}, due.length ? "عندك " + due.length + " كرت للمراجعة النهاردة" : "مفيش مراجعة مستحقة النهاردة ✓"), h("p", { class: "muted" }, "إجمالي كروتك: " + n), due.length ? h("button", { onclick: () => { startReview(); render(); } }, "ابدأ المراجعة") : null),
    genCard(), weakCard(), explainCard());
}
function examMilestones(key) { return S.exams.map(e => ({ e, dl: dnum(e.date) - dnum(key) })).filter(x => [14, 7, 3, 1].includes(x.dl)).map(x => ({ id: x.e.id + ":" + x.dl, name: (S.subjects.find(s => s.id === x.e.sid) || {}).name || "امتحان", kind: x.e.kind, dl: x.dl })); }
function homeBoost(key) {
  const due = dueCards(), ms = examMilestones(key), weak = weakList(3);
  const tmr = addDays(1), nudge = new Date().getHours() >= 17 && S.nudgeDay !== key && !S.exams.some(x => x.date === tmr);
  const soon = soonEvents(key);
  if (!due.length && !ms.length && !weak.length && !nudge && !soon.length) return null;
  return h("div", { class: "card boost" }, h("span", { class: "section-kicker" }, "عزّز مذاكرتك"),
    soon.map(x => { const miss = [!x.time && "الساعة", !x.place && "المكان"].filter(Boolean); return h("div", { style: "margin-top:12px;padding-bottom:10px;border-bottom:1px solid var(--line)" },
      h("b", {}, (x.dl ? "بكرة" : "النهاردة") + ": " + x.kind + (x.name ? " " + x.name : "")),
      h("p", { class: "muted", style: "margin:4px 0" }, [x.time ? "الساعة " + x.time : null, x.place ? "المكان: " + x.place : null, x.note ? "🎒 " + x.note : null].filter(Boolean).join(" • ") || "مفيش تفاصيل متسجّلة"),
      miss.length ? h("p", { class: "note", style: "margin:4px 0" }, "ناقص: " + miss.join(" و") + ". اسأل زمايلك وكمّله.") : null,
      h("label", { style: "display:flex;gap:8px;align-items:center" }, h("input", { type: "checkbox", checked: !!(S.ready || {})[x.id], onchange: e => { (S.ready = S.ready || {})[x.id] = e.target.checked; store.save(S); } }), h("span", {}, "أنا عارف المكان والساعة وجهّزت حاجتي"))); }),
    nudge ? h("div", { class: "brow" }, h("span", {}, "في كويز أو تسليم بكرة؟"), h("div", { class: "inl" }, h("button", { class: "sm", onclick: () => { examSt.date = tmr; examSt.kind = "كويز"; goTab("exams"); } }, "أضفه"), h("button", { class: "ghost sm", onclick: () => { S.nudgeDay = key; store.save(S); render(); } }, "مفيش"))) : null,
    due.length ? h("div", { class: "brow" }, h("span", {}, due.length + " كرت مراجعة النهاردة"), h("button", { class: "sm", onclick: () => { startReview(); goTab("review"); } }, "ابدأ")) : null,
    ms.map(m => h("label", { class: "brow", style: "justify-content:flex-start" }, h("input", { type: "checkbox", checked: !!(S.revDone || {})[m.id], onchange: e => { (S.revDone = S.revDone || {})[m.id] = e.target.checked; store.save(S); } }), h("span", {}, "راجع «" + m.name + "» — باقي " + m.dl + " يوم على الامتحان"))),
    weak.length ? h("div", { class: "brow" }, h("div", { class: "rv-tags", style: "margin:0" }, weak.map(([t, e]) => h("span", {}, t + " (" + e.w + "/" + e.t + ")"))), h("button", { class: "ghost sm", onclick: () => goTab("review") }, "الأخطاء")) : null);
}
function intentField() {
  const i = h("input", { type: "text", maxlength: 80, placeholder: "هتعمل إيه في الجلسة دي؟ (مثال: 5 مسائل تفاضل)", value: S.intent || "", "aria-label": "هدف الجلسة", disabled: !!tInt, oninput: e => { S.intent = e.target.value; } });
  i.addEventListener("change", () => store.save(S)); const st = S.intentStats;
  return h("div", { style: "text-align:start;margin:10px 0" }, h("label", { class: "muted", style: "display:block;margin-bottom:4px;font-size:.85rem" }, "هدف الجلسة (اختياري)"), i, st && st.total ? h("p", { class: "muted", style: "font-size:.8rem;margin:6px 0 0" }, "نفّذت " + st.done + " من " + st.total + " هدف جلسة") : null);
}
function askIntent() { const t = (S.intent || "").trim(); if (!t) return; setTimeout(async () => { const ok = await sure("خلّصت اللي نويت عليه؟ «" + t + "»"); const st = (S.intentStats = S.intentStats || { done: 0, total: 0 }); st.total++; if (ok) st.done++; S.intent = ""; store.save(S); render(); }, 700); }
