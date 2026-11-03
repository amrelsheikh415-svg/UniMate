/* ---------- المساعد الذكي ---------- */
let sample = null, hist = [], busy = false, live = null;
(window.claude && claude.use ? claude.use("sample").catch(() => null) : Promise.resolve(null)).then(s => { sample = s; if (tab === "ai") render(); });
const SYS = "أنت UniMate، مساعد دراسي ودود لطلاب الجامعة في مصر. اتكلم بالعامية المصرية البسيطة وخلّي إجاباتك عملية وقصيرة (أقل من 120 كلمة) من غير مقدمات. بيانات الطالب: ";
function ctxData() {
  const p = S.profile;
  return { الاسم: p.name, الجامعة: p.uni, السنة: p.year, ساعات_يوميا: p.hours, اكبر_مشكلة: probs(p).join("، "),
    المواد: S.subjects.map(s => ({ الاسم: s.name, الصعوبة: s.diff, محاضرات_متبقية: s.lectures.filter(l => !l.done).length })),
    الامتحانات: S.exams.map(e => ({ المادة: subj(e.sid)?.name, التاريخ: e.date })),
    أولوية_الخطة: planModeName(p.planMode || "balanced"),
    ساعات_المذاكرة_حسب_اليوم: p.dayHours || null,
    خطة_النهاردة: planFor(new Date()).map(x => ({ المادة: x.name, دقائق: x.min })) };
}
const context = () => SYS + JSON.stringify(ctxData());
const chatMsgs = () => hist.slice(0, -1).filter(m => !m.err);
async function callAI(msgs, onText) {
  if (AI_URL) {
    let r;
    try {
      r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: AI_KEY, Authorization: "Bearer " + ((track("chat"), await getTok()) || AI_KEY) },
        body: JSON.stringify({ messages: chatMsgs().map(({ role, content }) => ({ role, content })), context: ctxData() }) });
    } catch (e) { throw { code: "failed", detail: "network: " + (e && e.message) }; }
    if (r.status === 401) throw { code: "login_required" };
    if (r.status === 429) { const j = await r.json().catch(() => ({})); throw { code: j.error === "daily_limit" ? "daily_limit" : "rate_limited", limit: j.limit }; }
    if (!r.ok) { let d = ""; try { const j = await r.json(); d = j.error || j.message || JSON.stringify(j); } catch (e) {} throw { code: "failed", detail: r.status + " - " + d }; }
    const j = await r.json(); onText({ text: j.text }); return { text: j.text };
  }
  return sample(msgs, { cache: false, onText });
}
async function ask(text) {
  if (!(AI_URL || sample) || busy || !text.trim()) return;
  busy = true; hist.push({ role: "user", content: text }, { role: "assistant", content: "بفكر..." }); render();
  const msgs = chatMsgs().map((m, i) => i === 0 ? { role: "user", content: context() + "\n\nسؤال الطالب: " + m.content } : m);
  try {
    const r = await callAI(msgs, ({ text }) => { hist[hist.length - 1].content = text; if (live) { live.textContent = text; live.parentNode.scrollTop = 1e6; } });
    hist[hist.length - 1].content = r.text;
    if (hist.length > 12) hist.splice(0, 2);
  } catch (e) {
    hist.splice(-2); hist.push({ role: "assistant", content: e && e.code === "daily_limit" ? "وصلت للحد اليومي من رسائل المساعد. هيتجدد بكرة." : e && e.code === "login_required" ? "سجّل دخول الأول عشان تستخدم المساعد." : e && e.code === "rate_limited" ? "الطلبات كتير دلوقتي، جرّب بعد شوية." : "المساعد مش متاح حاليًا. جرّب تاني بعد شوية." + (e && e.detail ? " [" + e.detail + "]" : ""), err: true });
  }
  busy = false; render();
}
