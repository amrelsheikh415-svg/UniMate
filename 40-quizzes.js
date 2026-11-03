/* ---------- الاختبارات الذكية ---------- */
const QUIZ_URL = AI_URL.replace("quick-service", "quiz");
let aiMode = "chat";
const Q = { stage: "setup", text: "", files: [], count: 10, diff: "متوسط", short: true, subj: "", quiz: null, ans: [], i: 0, review: null, revErr: false, saved: false, busy: false, err: "" };
const QMAX = 50, QBATCH = 15; /* أقصى عدد أسئلة، وكل طلب للسيرفر بيطلّع لحد 15 سؤال */
const clampCount = v => Math.max(1, Math.min(QMAX, Math.round(+v) || 10));
const readB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = no; r.readAsDataURL(f); });
async function quizCall(body) {
  const r = await fetch(QUIZ_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: AI_KEY, Authorization: "Bearer " + ((await getTok()) || AI_KEY) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("سجّل دخول الأول عشان تستخدم الاختبارات.");
  if (r.status === 429 && j.error === "daily_limit") throw new Error("وصلت للحد اليومي من الاختبارات. هيتجدد بكرة.");
  if (!r.ok) { const er = new Error(j.error || r.status); er.detail = j.detail; throw er; } return j;
}
async function onFiles(e) {
  for (const f of [...e.target.files]) {
    if (/\.(txt|md)$/i.test(f.name) || f.type === "text/plain") { if (f.size > 2e6) { toast(f.name + " كبير أوي"); continue; } Q.text += (Q.text ? "\n\n" : "") + await f.text(); }
    else if (["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      if (f.size > 8e6) { toast(f.name + " أكبر من 8MB"); continue; }
      if (Q.files.length >= 4) { toast("الحد الأقصى 4 ملفات"); break; }
      Q.files.push({ name: f.name, mime: f.type, file: f });
    } else toast(f.name + ": النوع ده مش مدعوم (PDF أو صور أو txt)");
  }
  e.target.value = ""; render();
}
async function genQuiz() {
  if (Q.busy) return;
  if (!Q.text.trim() && !Q.files.length) { toast("ارفع المادة أو الصق النص الأول"); return; }
  const n = clampCount(Q.count); Q.count = n;
  Q.busy = true; Q.err = ""; Q.prog = ""; render();
  try {
    const files = await Promise.all(Q.files.map(async f => ({ mime: f.mime, data: await readB64(f.file) })));
    /* لو العدد أكبر من 15 بنقسمه على أكتر من طلب ونجمّع الأسئلة */
    const batches = Math.ceil(n / QBATCH), qs = [], seen = new Set(); let first = null, got = 0;
    for (let b = 0; b < batches; b++) {
      const c = Math.ceil((n - got) / (batches - b));
      if (batches > 1) { Q.prog = "بجهّز الأسئلة... دفعة " + (b + 1) + " من " + batches + " 🧠"; render(); }
      let r;
      try {
        r = await quizCall({ action: "generate", text: Q.text, files, count: c, short: b === 0 && Q.short ? 2 : 0, difficulty: Q.diff, subject: Q.subj, exclude: qs.map(x => x.q) });
      } catch (e) { if (b === 0) throw e; toast("اتولّد " + qs.length + " سؤال بس من " + n + " (حصل خطأ في آخر دفعة)"); break; }
      first = first || r;
      r.questions.forEach(x => { const k = String(x.q).trim(); if (!seen.has(k)) { seen.add(k); qs.push(x); } });
      got = qs.length;
    }
    const r = { ...first, questions: qs };
    Q.quiz = r; Q.ans = r.questions.map(() => null); Q.i = 0; Q.review = null; Q.revErr = false; Q.saved = false; Q.stage = "taking";
  } catch (e) { Q.err = /الحد اليومي|سجّل دخول/.test(e.message) ? e.message : e.message === "bad_quiz" ? "معرفتش أطلّع أسئلة كويسة من المادة دي. جرّب مادة أطول أو أوضح." + (e.detail ? " [" + JSON.stringify(e.detail).slice(0, 500) + "]" : "") : /timeout|504/.test(e.message) ? "الطلب أخد وقت أطول من اللازم. جرّب ملف أصغر (صفحات أقل) أو اعمل الاختبار على جزء من المادة." : "تعذر توليد الاختبار (" + e.message + "). جرّب تاني."; }
  Q.busy = false; render();
}
async function submitQuiz() {
  const un = Q.ans.filter(a => a == null || a === "").length;
  if (un && !(await sure("لسه فاضل " + un + " سؤال من غير إجابة. تسلّم كده؟"))) return;
  Q.stage = "result"; Q.review = null; Q.revErr = false; Q.saved = false; recordQuiz("mcq"); render(); doReview();
}
const qPts = () => Q.quiz.questions.reduce((a, x, i) => a + (x.type === "mcq" ? (Q.ans[i] === x.answer ? 1 : 0) : ((Q.review && (Q.review.items.find(r => r.index === i) || {}).score) || 0)), 0);
async function doReview() {
  const items = Q.quiz.questions.map((x, i) => x.type === "mcq"
    ? { type: "mcq", topic: x.topic, q: x.q, student: Q.ans[i] == null ? "(مفيش إجابة)" : x.options[Q.ans[i]], right: x.options[x.answer], correct: Q.ans[i] === x.answer }
    : { type: "short", topic: x.topic, q: x.q, student: Q.ans[i] || "(مفيش إجابة)", right: x.model_answer });
  try { Q.review = await quizCall({ action: "review", items }); recordQuiz("short"); } catch (e) { Q.revErr = true; }
  if (!Q.saved) { Q.saved = true; S.quizzes = S.quizzes || []; S.quizzes.unshift({ d: iso(new Date()), s: Q.subj, t: Q.quiz.title, p: Math.round(qPts() / Q.quiz.questions.length * 100), n: Q.quiz.questions.length }); S.quizzes = S.quizzes.slice(0, 20); store.save(S); }
  render();
}
const LET = ["أ", "ب", "ج", "د", "هـ", "و"];
const qSeg = (val, opts, set) => h("div", { class: "seg", role: "group" }, opts.map(([v, l]) => h("button", { type: "button", class: "ghost sm" + (String(val) === String(v) ? " on" : ""), "aria-pressed": String(String(val) === String(v)), onclick: () => { set(v); render(); } }, l)));
const qSel = (val, opts, set) => h("select", { onchange: e => set(e.target.value), value: String(val) }, opts.map(([v, l]) => h("option", { value: v }, l)));
function quizSetup() {
  const ta = h("textarea", { rows: 6, placeholder: "الصق نص المادة هنا... أو ارفع ملفات تحت", oninput: e => { Q.text = e.target.value; }, value: Q.text });
  const hist = S.quizzes || [];
  return h("div", {},
    h("div", { class: "card" }, h("h3", {}, "اختبرني في مادتي 📝"),
      h("p", { class: "muted" }, "ارفع المحاضرة (PDF أو صور) أو الصق النص، والـAI يعملك اختبار منها ويقيّمك في الآخر."),
      h("label", { class: "muted" }, "المادة (اختياري)"), qSel(Q.subj, [["", "من غير تحديد"], ...S.subjects.map(s => [s.name, s.name])], v => { Q.subj = v; }),
      ta,
      h("label", { class: "muted", style: "display:block;margin-top:8px" }, "ملفات (PDF، صور، txt) — لحد 4 ملفات، كل واحد أقل من 8MB"),
      h("input", { type: "file", accept: ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md", multiple: true, onchange: onFiles }),
      Q.files.map((f, i) => h("div", { class: "lb" }, h("span", { class: "n" }, "📎 " + f.name), h("button", { class: "ghost sm", onclick: () => { Q.files.splice(i, 1); render(); } }, "حذف"))),
      h("div", { class: "stack" },
        h("div", {}, h("label", { class: "muted" }, "عدد الأسئلة (من 1 لـ " + QMAX + ")"),
          h("input", { type: "number", inputmode: "numeric", min: 1, max: QMAX, step: 1, value: Q.count, "aria-label": "عدد الأسئلة",
            oninput: e => { Q.count = e.target.value; },
            onchange: e => { Q.count = clampCount(e.target.value); e.target.value = Q.count; render(); } }),
          qSeg(Q.count, [[5, "5"], [10, "10"], [20, "20"], [30, "30"], [50, "50"]], v => { Q.count = +v; })),
        h("div", {}, h("label", { class: "muted" }, "الصعوبة"), qSeg(Q.diff, ["سهل", "متوسط", "صعب"].map(x => [x, x]), v => { Q.diff = v; }))),
      h("label", { class: "opt", style: "margin-top:10px" }, h("input", { type: "checkbox", checked: Q.short, onchange: e => { Q.short = e.target.checked; } }), "ضيف سؤالين مقاليين قصيرين يصححهم الـAI"),
      Q.err && h("p", { class: "note" }, Q.err),
      h("button", { class: "big", disabled: Q.busy, onclick: genQuiz }, Q.busy ? (Q.prog || "بجهّز الاختبار... ممكن ياخد لحد دقيقة 🧠") : "ولّد الاختبار")),
    hist.length ? h("div", { class: "card" }, h("h3", {}, "آخر اختباراتك"), hist.slice(0, 6).map(r => h("div", { class: "lb" }, h("span", { class: "n" }, (r.t || "اختبار") + (r.s ? " — " + r.s : "") + " · " + r.d), h("span", {}, r.p + "%")))) : null);
}
function quizTake() {
  const qs = Q.quiz.questions, x = qs[Q.i], n = qs.length, last = Q.i === n - 1;
  const body = x.type === "mcq"
    ? x.options.map((o, k) => h("label", { class: "opt mc" }, h("input", { type: "radio", name: "qa", checked: Q.ans[Q.i] === k, onchange: () => { Q.ans[Q.i] = k; } }), h("span", { class: "lt" }, LET[k] || k + 1), h("span", {}, o)))
    : h("textarea", { rows: 5, placeholder: "اكتب إجابتك هنا...", oninput: e => { Q.ans[Q.i] = e.target.value; }, value: Q.ans[Q.i] || "" });
  return h("div", {}, h("div", { class: "card" },
    h("p", { class: "muted" }, "سؤال " + (Q.i + 1) + " من " + n + (x.type === "short" ? " — مقالي" : "") + " · " + x.topic),
    h("div", { class: "bar" }, h("i", { style: "width:" + Math.round((Q.i + 1) / n * 100) + "%" })),
    h("h3", { class: "qq" }, x.q), body,
    h("div", { class: "inl", style: "margin-top:10px" },
      h("button", { class: "ghost", disabled: Q.i === 0, onclick: () => { Q.i--; render(); } }, "السابق"),
      last ? h("button", { onclick: submitQuiz }, "سلّم الاختبار ✅") : h("button", { onclick: () => { Q.i++; render(); } }, "التالي"))),
    h("button", { class: "ghost sm", onclick: async () => { if (await sure("تلغي الاختبار؟")) { Q.stage = "setup"; render(); } } }, "إلغاء الاختبار"));
}
function quizResult() {
  const qs = Q.quiz.questions, rv = Q.review, pct = Math.round(qPts() / qs.length * 100), o = rv && rv.overall;
  const li = (icon, arr, c) => (arr || []).length ? h("div", { class: "grp " + c }, arr.map(t => h("p", {}, icon + " " + t))) : null;
  const sc = i => rv ? (rv.items.find(r => r.index === i) || {}) : {};
  return h("div", {},
    h("div", { class: "card" }, h("h3", { style: "text-align:center" }, "نتيجتك"), h("div", { class: "ring", style: "--p:" + pct + ";--c:" + (pct >= 70 ? "var(--mint)" : pct >= 40 ? "var(--sun)" : "var(--pink)") }, h("b", {}, pct + "%")),
      h("p", { class: "muted", style: "text-align:center" }, o ? "المستوى: " + o.level : Q.revErr ? "" : "بقيّمك وبصحّح الأسئلة المقالية..."),
      Q.revErr && h("div", {}, h("p", { class: "note" }, "تعذر التقييم الذكي. نتيجة الاختيارات ظاهرة، والمقالي ماتصححش."), h("button", { class: "sm", onclick: () => { Q.revErr = false; render(); doReview(); } }, "جرّب التقييم تاني")),
      o && h("div", {}, h("p", {}, o.summary), li("✅", o.strengths, "ok"), li("⚠️", o.weaknesses, "warn"), o.advice.length ? h("h3", { style: "margin-top:10px" }, "نصايح للمراجعة") : null, li("💡", o.advice, "tip"))),
    qs.map((x, i) => {
      const ok = x.type === "mcq" ? Q.ans[i] === x.answer : (sc(i).score ?? 0) >= 1, part = x.type === "short" && sc(i).score > 0 && sc(i).score < 1;
      return h("div", { class: "card qr " + (ok ? "ok" : part ? "part" : "bad") }, h("p", { class: "muted" }, (ok ? "✅" : part ? "🟡" : "❌") + " سؤال " + (i + 1) + " · " + x.topic), h("h3", {}, x.q),
        x.type === "mcq" ? [h("p", { class: "ans " + (ok ? "ok" : "bad") }, "إجابتك: " + (Q.ans[i] == null ? "—" : x.options[Q.ans[i]])), ok ? null : h("p", { class: "ans ok" }, "الصح: " + x.options[x.answer])]
          : [h("p", { class: "ans" }, "إجابتك: " + (Q.ans[i] || "—")), h("p", { class: "ans ok" }, "الإجابة النموذجية: " + x.model_answer), sc(i).feedback ? h("p", { class: "note" }, sc(i).feedback) : null],
        h("p", { class: "muted" }, "💬 " + x.explanation));
    }),
    h("div", { class: "inl" },
      h("button", { onclick: () => { Q.stage = "setup"; Q.quiz = null; render(); } }, "اختبار جديد"),
      h("button", { class: "ghost", onclick: () => { Q.ans = Q.quiz.questions.map(() => null); Q.i = 0; Q.review = null; Q.saved = false; Q.stage = "taking"; render(); } }, "أعد نفس الأسئلة")));
}
const quizView = () => Q.stage === "taking" && Q.quiz ? quizTake() : Q.stage === "result" && Q.quiz ? quizResult() : quizSetup();
function aiView() {
  const seg = h("div", { class: "picks" }, [["chat", "💬 اسأل"], ["quiz", "📝 اختبرني"]].map(([k, l]) => h("button", { class: "ghost sm" + (aiMode === k ? " on" : ""), onclick: () => { aiMode = k; render(); } }, l)));
  return h("div", {}, seg, aiMode === "quiz" ? quizView() : chatView());
}
function chatView() {
  if (!(AI_URL || sample)) return h("div", {}, head("المساعد الذكي", "اسأل عن خطتك أو أي حاجة في مذاكرتك"), h("p", { class: "note" }, "المساعد مش متاح في الجلسة دي. هيشتغل لما تفتح الصفحة المنشورة على Claude."));
  const q = h("input", { type: "text", placeholder: "اسأل عن أي حاجة في مذاكرتك", "aria-label": "سؤالك" });
  const sendIc = () => { const n = document.createElement("span"); n.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'; return n; };
  const go = () => { const v = q.value; q.value = ""; ask(v); };
  q.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  const chat = h("div", { class: "chat", "aria-live": "polite" }, hist.length ? hist.map(m => h("div", { class: "msg " + (m.role === "user" ? "u" : "a") }, m.content)) : h("div", { class: "msg a" }, "أهلاً! أنا مساعدك الجامعي 👋\nاسألني عن خطتك، أو ازاي تنظّم مذاكرتك، أو اختار اقتراح من فوق."));
  live = hist.length && hist[hist.length - 1].role === "assistant" ? chat.lastChild : null;
  setTimeout(() => chat.scrollTop = 1e6);
  return h("div", {}, head("المساعد الذكي", "اسأل عن خطتك أو أي حاجة في مذاكرتك"),
    h("div", { class: "sugg" }, ["حلّل خطتي وادّيني نصيحة", "ازاي أبطّل تأجيل؟", "اعملّي خطة مراجعة لأقرب امتحان"].map(t => h("button", { class: "ghost sm", disabled: busy, onclick: () => ask(t) }, t))),
    h("div", { class: "card chatcard" }, chat, h("div", { class: "composer" }, q, h("button", { class: "send", "aria-label": "إرسال", disabled: busy, onclick: go }, sendIc()))));
}