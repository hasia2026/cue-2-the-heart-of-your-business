// CUE AI — grounded assistant. Answers are computed from the org's actual
// records via deterministic intent routing. When data doesn't support an
// answer, it says so. No fabricated business facts, ever.
// Locale-aware: EN / ES / VI / AR templates. Numbers and names stay verbatim.
import { sql } from "./db";
import { isLocale, type Locale } from "./i18n";

export type AssistantAnswer = {
  answer: string;
  sources: { label: string; kind: string }[];
  suggestions: string[];
};

const SUGGESTED: Record<Locale, string[]> = {
  en: ["What should I focus on today?", "What's unbilled in service?", "Which leads need follow-up?", "Why did the health score change?"],
  es: ["¿En qué debería enfocarme hoy?", "¿Qué está sin facturar en servicio?", "¿Qué leads necesitan seguimiento?", "¿Por qué cambió la puntuación de salud?"],
  vi: ["Hôm nay tôi nên tập trung vào điều gì?", "Có gì chưa xuất hóa đơn ở dịch vụ?", "Khách hàng nào cần liên hệ lại?", "Vì sao điểm sức khỏe thay đổi?"],
  ar: ["ما الذي يجب أن أركز عليه اليوم؟", "ما هو العمل غير المفوتر في الصيانة؟", "أي العملاء يحتاجون متابعة؟", "لماذا تغيرت درجة الصحة؟"],
};

// Questions about CUE itself — what it is, how it helps, revenue, connecting systems
const CUE_RE =
  /(what is cue|what's cue|whats cue|about cue|how does cue|how can cue|how cue|cue work|cue help|what can cue|why cue|generate revenue|make money|find.*(money|revenue)|disconnected|connect.*system|integrat|que es cue|como funciona|como ayuda|como puede ayudar|generar ingresos|conectar.*sistema|sistemas desconectad|cue la gi|cue hoat dong|ket noi.*he thong|he thong roi rac|hệ thống rời rạc|kết nối hệ thống|ما هو cue|كيف يعمل cue|كيف يساعد cue|توليد الإيرادات|ربط الأنظمة|أنظمة مفككة)/;

// Template strings per locale
const T = {
  en: {
    focusHead: "Based on your current open insights, the highest-attention items are:",
    atStake: "at stake",
    focusTail: "Each has an approved recommendation path in Understand → Execute when you're ready to act.",
    noInsights: "No open insights right now — the board is clear. Try refreshing intelligence in Understand after new activity lands.",
    unbilled: "Unbilled completed service orders:",
    overdue: "Overdue invoices:",
    worth: "worth",
    billingDirty: "Both have ready-to-run recovery workflows in Execute — approving the matching recommendation generates the task list.",
    billingClean: "Nothing outstanding — billing is clean.",
    leadsHead: "Leads waiting longest for follow-up:",
    waitingSince: "waiting since",
    leadsTail: "The 48-hour recovery sprint recommendation covers these.",
    noLeads: "No open leads right now.",
    invHead: "Oldest available inventory:",
    listed: "listed",
    noInv: "No available inventory recorded.",
    healthHead: "The Business Health Score is computed live from your records — weighted across revenue, pipeline, operations, inventory, customers, team, and data quality. Each dimension on the Company Compass page shows its own score, evidence, reasoning, and confidence. Open Company Compass to inspect the current breakdown, or click any dimension to see exactly why it scored that way.",
    knowledgeHead: "From your company knowledge:",
    fallback:
      "I don't have information in your records that answers that. I can answer from actual data on: what CUE is and how it helps, revenue it could recover, connecting disconnected systems, focus/priorities, unbilled service work, overdue invoices, lead follow-up, inventory aging, and the health score. Ask one of those, or capture the relevant document in Capture first.",
    cueWhat:
      "CUE is an AI Business Operating System — one intelligent loop for your whole company: Capture (every document, conversation, and record — organized and searchable), Understand (evidence-first intelligence from your actual data), Enhance (brand, customer experience, process), Execute (approved recommendations become workflows and tasks), and Expand (growth measured from your own knowledge).",
    cueHelp:
      "How it helps: it replaces guesswork with evidence. Every insight shows its numbers, every recommendation carries proof, and nothing runs without your approval — CUE prepares, you decide.",
    cueRevenue:
      "Revenue: CUE finds money you're already earning but not collecting — completed work never invoiced, invoices past due, leads that went cold, inventory aging past its priced window. Approving a recommendation turns the fix into a concrete task list your team can run.",
    cueConnect:
      "Disconnected systems: CUE captures from every source — documents, emails, conversations, data imports, voice notes — and connects the dots into one searchable source of truth. The Connected Ecosystem page tracks each integration as demo, available, or connected.",
    cueLiveHead: "In your records right now:",
    cueLiveUnbilled: "{x} of completed work is unbilled ({n} jobs).",
    cueLiveOverdue: "{x} is overdue in invoices.",
    cueLiveLeads: "{n} leads are waiting for follow-up.",
  },
  es: {
    focusHead: "Según tus observaciones abiertas, lo que más atención requiere es:",
    atStake: "en juego",
    focusTail: "Cada una tiene una ruta de recomendación aprobada en Entender → Ejecutar cuando estés listo para actuar.",
    noInsights: "No hay observaciones abiertas — el tablero está limpio. Prueba actualizar la inteligencia en Entender tras nueva actividad.",
    unbilled: "Órdenes de servicio completadas sin facturar:",
    overdue: "Facturas vencidas:",
    worth: "valoradas en",
    billingDirty: "Ambas tienen flujos de recuperación listos en Ejecutar — aprobar la recomendación correspondiente genera la lista de tareas.",
    billingClean: "Nada pendiente — la facturación está limpia.",
    leadsHead: "Leads que más esperan un seguimiento:",
    waitingSince: "en espera desde",
    leadsTail: "La recomendación del sprint de recuperación de 48 horas cubre estos.",
    noLeads: "No hay leads abiertos ahora mismo.",
    invHead: "Inventario disponible más antiguo:",
    listed: "en lista",
    noInv: "No hay inventario disponible registrado.",
    healthHead: "La Puntuación de Salud del Negocio se calcula en vivo desde tus registros — ponderada entre ingresos, embudo, operaciones, inventario, clientes, equipo y calidad de datos. Cada dimensión en la Brújula de empresa muestra su propia puntuación, evidencia, razonamiento y confianza. Abre la Brújula de empresa para ver el desglose actual.",
    knowledgeHead: "Del conocimiento de tu empresa:",
    fallback:
      "No tengo información en tus registros que responda eso. Puedo responder con datos reales sobre: qué es CUE y cómo ayuda, ingresos que podría recuperar, cómo conecta sistemas desconectados, prioridades, trabajo de servicio sin facturar, facturas vencidas, seguimiento de leads, antigüedad de inventario y la puntuación de salud. Pregunta por uno de esos, o captura el documento correspondiente en Capturar.",
    cueWhat:
      "CUE es un sistema operativo de negocio con IA — un ciclo inteligente para toda tu empresa: Capturar (cada documento, conversación y registro, organizado y buscable), Entender (inteligencia con evidencia desde tus datos reales), Mejorar (marca, experiencia del cliente, procesos), Ejecutar (las recomendaciones aprobadas se vuelven flujos y tareas) y Expandir (crecimiento medido desde tu propio conocimiento).",
    cueHelp:
      "Cómo ayuda: reemplaza las suposiciones por evidencia. Cada observación muestra sus números, cada recomendación lleva prueba, y nada se ejecuta sin tu aprobación — CUE prepara, tú decides.",
    cueRevenue:
      "Ingresos: CUE encuentra dinero que ya estás generando pero no cobras — trabajo completado sin facturar, facturas vencidas, clientes que se enfriaron, inventario que envejece fuera de su ventana de precio. Aprobar una recomendación convierte la solución en una lista de tareas concreta que tu equipo puede ejecutar.",
    cueConnect:
      "Sistemas desconectados: CUE captura desde cada fuente — documentos, correos, conversaciones, importaciones de datos, notas de voz — y conecta los puntos en una sola fuente de verdad buscable. La página de Ecosistema registra cada integración como demo, disponible o conectada.",
    cueLiveHead: "En tus registros ahora mismo:",
    cueLiveUnbilled: "{x} en trabajo completado sin facturar ({n} órdenes).",
    cueLiveOverdue: "{x} vencido en facturas.",
    cueLiveLeads: "{n} clientes potenciales esperan seguimiento.",
  },
  vi: {
    focusHead: "Dựa trên các nhận định đang mở của bạn, những mục cần chú ý nhất là:",
    atStake: "đang chịu rủi ro",
    focusTail: "Mỗi mục đều có lộ trình đề xuất đã duyệt trong Hiểu → Thực thi khi bạn sẵn sàng hành động.",
    noInsights: "Chưa có nhận định nào — bảng đang trống. Hãy làm mới trí tuệ trong Hiểu sau khi có hoạt động mới.",
    unbilled: "Đơn dịch vụ đã hoàn thành chưa xuất hóa đơn:",
    overdue: "Hóa đơn quá hạn:",
    worth: "trị giá",
    billingDirty: "Cả hai đều có quy trình khôi phục sẵn trong Thực thi — duyệt đề xuất tương ứng sẽ tạo danh sách công việc.",
    billingClean: "Không có gì tồn đọng — thanh toán sạch sẽ.",
    leadsHead: "Khách hàng chờ liên hệ lâu nhất:",
    waitingSince: "chờ từ",
    leadsTail: "Đề xuất chạy nước rút phục hồi 48 giờ bao gồm các khách hàng này.",
    noLeads: "Hiện không có khách hàng nào đang mở.",
    invHead: "Tồn kho khả dụng lâu nhất:",
    listed: "đăng từ",
    noInv: "Không có tồn kho khả dụng nào được ghi nhận.",
    healthHead: "Điểm Sức khỏe Doanh nghiệp được tính trực tiếp từ hồ sơ của bạn — trọng số qua doanh thu, quy trình bán hàng, vận hành, tồn kho, khách hàng, đội ngũ và chất lượng dữ liệu. Mỗi chiều trên La bàn công ty hiển thị điểm, bằng chứng, lý do và độ tin cậy riêng. Mở La bàn công ty để xem chi tiết.",
    knowledgeHead: "Từ kiến thức công ty của bạn:",
    fallback:
      "Tôi không có thông tin trong hồ sơ của bạn để trả lời điều đó. Tôi có thể trả lời từ dữ liệu thực tế về: CUE là gì và giúp thế nào, doanh thu có thể thu hồi, cách kết nối hệ thống rời rạc, ưu tiên, công việc dịch vụ chưa xuất hóa đơn, hóa đơn quá hạn, theo dõi khách hàng, tồn kho lâu, và điểm sức khỏe. Hãy hỏi một trong những chủ đề đó, hoặc thu thập tài liệu liên quan trong Thu thập trước.",
    cueWhat:
      "CUE là hệ điều hành doanh nghiệp bằng AI — một vòng lặp thông minh cho cả công ty: Thu thập (mọi tài liệu, cuộc trò chuyện và hồ sơ, có tổ chức và tìm được), Hiểu (trí tuệ có bằng chứng từ dữ liệu thực), Nâng cao (thương hiệu, trải nghiệm khách hàng, quy trình), Thực thi (đề xuất được duyệt trở thành quy trình và công việc) và Mở rộng (tăng trưởng đo từ kiến thức của bạn).",
    cueHelp:
      "Cách giúp bạn: thay phỏng đoán bằng bằng chứng. Mỗi nhận định đều có số liệu, mỗi đề xuất đều có căn cứ, và không gì chạy khi chưa có bạn duyệt — CUE chuẩn bị, bạn quyết định.",
    cueRevenue:
      "Doanh thu: CUE tìm ra tiền bạn đang kiếm nhưng chưa thu — việc hoàn thành chưa xuất hóa đơn, hóa đơn quá hạn, khách hàng nguội lạnh, tồn kho cũ quá cửa sổ giá. Duyệt một đề xuất biến giải pháp thành danh sách công việc cụ thể mà đội của bạn có thể chạy.",
    cueConnect:
      "Hệ thống rời rạc: CUE thu thập từ mọi nguồn — tài liệu, email, hội thoại, dữ liệu nhập, ghi chú giọng nói — và nối các mảnh lại thành một nguồn sự thật tìm được. Trang Hệ sinh thái ghi mỗi tích hợp là demo, khả dụng hoặc đã kết nối.",
    cueLiveHead: "Trong hồ sơ của bạn ngay bây giờ:",
    cueLiveUnbilled: "{x} việc đã hoàn thành chưa xuất hóa đơn ({n} đơn).",
    cueLiveOverdue: "{x} hóa đơn quá hạn.",
    cueLiveLeads: "{n} khách hàng đang chờ liên hệ.",
  },
  ar: {
    focusHead: "بناءً على رؤيتك المفتوحة حالياً، العناصر الأكثر أهمية هي:",
    atStake: "على المحك",
    focusTail: "كل عنصر لديه مسار توصية معتمد في الفهم ← التنفيذ عندما تكون مستعداً للتحرك.",
    noInsights: "لا توجد رؤى مفتوحة — اللوحة واضحة. جرّب تحديث الذكاء في الفهم بعد نشاط جديد.",
    unbilled: "أوامر الخدمة المكتملة غير المفوترة:",
    overdue: "الفواتير المتأخرة:",
    worth: "بقيمة",
    billingDirty: "كلاهما لديه سير عمل جاهز في التنفيذ — الموافقة على التوصية المطابقة تنشئ قائمة المهام.",
    billingClean: "لا يوجد شيء مستحق — الفوترة نظيفة.",
    leadsHead: "العملاء الذين ينتظرون المتابعة منذ أطول فترة:",
    waitingSince: "ينتظر منذ",
    leadsTail: "توصية العدوة السريعة خلال ٤٨ ساعة تغطي هؤلاء.",
    noLeads: "لا يوجد عملاء مفتوحون الآن.",
    invHead: "أقدم مخزون متاح:",
    listed: "مدرج",
    noInv: "لا يوجد مخزون متاح مسجل.",
    healthHead: "تُحسب درجة صحة الأعمال مباشرة من سجلاتك — موزونة عبر الإيرادات وخط المبيعات والعمليات والمخزون والعملاء والفريق وجودة البيانات. كل بعد في صفحة بوصلة الشركة يعرض درجته ودليله ومنطقه وثقته. افتح بوصلة الشركة لرؤية التفاصيل الحالية.",
    knowledgeHead: "من معرفة شركتك:",
    fallback:
      "لا أملك معلومات في سجلاتك تجيب على ذلك. أستطيع الإجابة من بيانات فعلية عن: ما هو CUE وكيف يساعد، الإيرادات التي يمكن استردادها، ربط الأنظمة المفككة، الأولويات، عمل الصيانة غير المفوتر، الفواتير المتأخرة، متابعة العملاء، تقادم المخزون، ودرجة الصحة. اسأل عن أحدها، أو التق المستند ذا الصلة في التقاط أولاً.",
    cueWhat:
      "CUE هو نظام تشغيل الأعمال بالذكاء الاصطناعي — حلقة ذكية واحدة لكل شركتك: التقاط (كل مستند ومحادثة وسجل، منظم وقابل للبحث)، الفهم (ذكاء مدعوم بالأدلة من بياناتك الفعلية)، التحسين (العلامة وتجربة العملاء والعمليات)، التنفيذ (التوصيات المعتمدة تصبح سير عمل ومهام)، والتوسع (نمو مقاس من معرفتك الخاصة).",
    cueHelp:
      "كيف يساعد: يستبدل التخمين بالأدلة. كل رؤية تُظهر أرقامها، كل توصية تحمل إثباتها، ولا شيء يُنفّذ دون موافقتك — CUE يجهّز وأنت تقرر.",
    cueRevenue:
      "الإيرادات: يجد CUE مالاً تكسبه بالفعل لكنك لا تحصّله — عمل مكتمل غير مفوتر، فواتير متأخرة، عملاء بردوا، ومخزون تجاوز نافذة سعره. الموافقة على توصية تحوّل الحل إلى قائمة مهام ملموسة يمكن لفريقك تنفيذها.",
    cueConnect:
      "الأنظمة المفككة: يلتقط CUE من كل مصدر — مستندات وبريد ومحادثات واستيراد بيانات وملاحظات صوتية — ويربط النقاط في مصدر حقيقة واحد قابل للبحث. صفحة النظام البيئي تُظهر كل تكامل: تجريبي أو متاح أو متصل.",
    cueLiveHead: "في سجلاتك الآن:",
    cueLiveUnbilled: "{x} عمل مكتمل غير مفوتر ({n} أوامر).",
    cueLiveOverdue: "{x} فواتير متأخرة.",
    cueLiveLeads: "{n} عملاء ينتظرون المتابعة.",
  },
} as const;

function L(locale: unknown): Locale {
  return isLocale(locale) ? locale : "en";
}

export async function answerQuestion(
  organizationId: string,
  question: string,
  locale: Locale = "en"
): Promise<AssistantAnswer> {
  const q = question.toLowerCase();
  const t = T[locale];
  const sources: { label: string; kind: string }[] = [];
  const money = (n: number) =>
    "$" + n.toLocaleString(locale === "ar" ? "en-US" : locale === "vi" ? "vi-VN" : locale === "es" ? "es-MX" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Focus / attention
  if (/(focus|attention|today|priority|next|enfocar|hoy|prioridad|tập trung|hôm nay|ưu tiên|ركز|اليوم|أولوية)/.test(q)) {
    const rows = await sql`
      select i.title, i.severity, i.impact_value from insights i
      where i.organization_id = ${organizationId} and i.status = 'OPEN'
      order by case i.severity when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, i.impact_value desc nulls last
      limit 3`;
    if (rows.length) {
      sources.push({ label: "Open insights", kind: "QUERY" });
      return {
        answer:
          `${t.focusHead}\n\n` +
          rows.map((r, i) => `${i + 1}. ${r.title}${r.impact_value ? ` (${money(Math.round(Number(r.impact_value)))} ${t.atStake})` : ""} [${r.severity}]`).join("\n") +
          `\n\n${t.focusTail}`,
        sources,
        suggestions: SUGGESTED[locale],
      };
    }
    return { answer: t.noInsights, sources, suggestions: SUGGESTED[locale] };
  }

  // Unbilled / billing / revenue leakage
  if (/(unbill|not.*invoice|invoice|billing|collect|overdue|receivab|factur|vencid|cobr|hóa đơn|thanh toán|quá hạn|فوترة|فاتورة|متأخر)/.test(q)) {
    const [so] = await sql`
      select count(*)::int as n, coalesce(sum(amount),0)::float as total
      from service_orders where organization_id = ${organizationId} and status='COMPLETED' and invoiced_at is null`;
    const [inv] = await sql`
      select count(*)::int as n, coalesce(sum(amount),0)::float as total
      from invoices where organization_id = ${organizationId} and status='OVERDUE'`;
    sources.push({ label: "service_orders (completed, uninvoiced)", kind: "QUERY" });
    sources.push({ label: "invoices (overdue)", kind: "QUERY" });
    return {
      answer:
        `${t.unbilled} ${so.n} ${t.worth} ${money(Number(so.total.toFixed(2)))}.\n` +
        `${t.overdue} ${inv.n} ${t.worth} ${money(Number(inv.total.toFixed(2)))}.\n\n` +
        (so.n || inv.n ? t.billingDirty : t.billingClean),
      sources,
      suggestions: SUGGESTED[locale],
    };
  }

  // Leads / follow-up
  if (/(lead|follow.?up|prospect|pipeline|cliente|seguimiento|khách hàng|liên hệ|عميل|متابعة)/.test(q)) {
    const rows = await sql`
      select name, est_value, status, created_at from leads
      where organization_id = ${organizationId} and status in ('NEW','CONTACTED')
      order by coalesce(last_contact_at, created_at) asc limit 5`;
    sources.push({ label: "leads (stale first)", kind: "QUERY" });
    if (rows.length) {
      return {
        answer:
          `${t.leadsHead}\n\n` +
          rows.map((r) => `• ${r.name} — ${money(Number(r.est_value ?? 0))} [${r.status}], ${t.waitingSince} ${new Date(r.created_at).toLocaleDateString()}`).join("\n") +
          `\n\n${t.leadsTail}`,
        sources,
        suggestions: SUGGESTED[locale],
      };
    }
    return { answer: t.noLeads, sources, suggestions: SUGGESTED[locale] };
  }

  // Inventory / aging
  if (/(inventory|aging|days on lot|vehicles|stock|unsold|inventario|antigüedad|vehículos|tồn kho|xe|motores|مخزون|مركبات)/.test(q)) {
    const rows = await sql`
      select stock_number, year, make, model, list_price, listed_at from vehicles
      where organization_id = ${organizationId} and status = 'AVAILABLE'
      order by listed_at asc limit 5`;
    sources.push({ label: "vehicles (oldest first)", kind: "QUERY" });
    if (!rows.length) return { answer: t.noInv, sources, suggestions: SUGGESTED[locale] };
    return {
      answer:
        `${t.invHead}\n\n` +
        rows.map((r) => `• ${r.year} ${r.make} ${r.model} (${r.stock_number}) — ${money(Number(r.list_price ?? 0))}, ${t.listed} ${new Date(r.listed_at).toLocaleDateString()} (${Math.floor((Date.now() - new Date(r.listed_at).getTime()) / 864e5)}d)`).join("\n"),
      sources,
      suggestions: SUGGESTED[locale],
    };
  }

  // Health score
  if (/(health|score|compass|salud|puntuación|brújula|sức khỏe|điểm|bàn chỉ|صحة|درجة|بوصلة)/.test(q)) {
    sources.push({ label: "Business Health (computed)", kind: "CALC" });
    return { answer: t.healthHead, sources, suggestions: SUGGESTED[locale] };
  }

  // What is CUE / how it helps / revenue it could recover / connecting systems
  if (CUE_RE.test(q)) {
    sources.push({ label: "CUE overview", kind: "ABOUT" });
    let answer = `${t.cueWhat}\n\n${t.cueHelp}\n\n${t.cueRevenue}`;
    try {
      const [so] = await sql`
        select coalesce(sum(amount),0)::float as total, count(*)::int as n
        from service_orders where organization_id = ${organizationId} and status='COMPLETED' and invoiced_at is null`;
      const [inv] = await sql`
        select coalesce(sum(amount),0)::float as total
        from invoices where organization_id = ${organizationId} and status='OVERDUE'`;
      const [ld] = await sql`
        select count(*)::int as n from leads
        where organization_id = ${organizationId} and status in ('NEW','CONTACTED')`;
      const live: string[] = [];
      if (Number(so.total) > 0) live.push(t.cueLiveUnbilled.replace("{x}", money(Number(so.total))).replace("{n}", String(so.n)));
      if (Number(inv.total) > 0) live.push(t.cueLiveOverdue.replace("{x}", money(Number(inv.total))));
      if (ld && ld.n > 0) live.push(t.cueLiveLeads.replace("{n}", String(ld.n)));
      if (live.length) answer += `\n\n${t.cueLiveHead} ${live.join(" ")}`;
    } catch {
      // Live numbers are optional garnish — the static answer already stands on its own.
    }
    answer += `\n\n${t.cueConnect}`;
    return { answer, sources, suggestions: SUGGESTED[locale] };
  }

  // Policy / knowledge questions — search knowledge items
  const kRows = await sql`
    select title, content, category from knowledge_items
    where organization_id = ${organizationId}
      and (title ilike ${"%" + question.replace(/[%\s]+/g, "%") + "%"}
        or content ilike ${"%" + question.replace(/[%\s]+/g, "%") + "%"})
    limit 3`;
  if (kRows.length) {
    sources.push({ label: "knowledge_items", kind: "SEARCH" });
    return {
      answer:
        `${t.knowledgeHead}\n\n` +
        kRows.map((k) => `**${k.title}** (${k.category})\n${k.content}`).join("\n\n"),
      sources,
      suggestions: SUGGESTED[locale],
    };
  }

  // Honest fallback
  return { answer: t.fallback, sources, suggestions: SUGGESTED[locale] };
}
