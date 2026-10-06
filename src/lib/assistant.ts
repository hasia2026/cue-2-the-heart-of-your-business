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
      "I don't have information in your records that answers that. I can answer from actual data on: focus/priorities, unbilled service work, overdue invoices, lead follow-up, inventory aging, and the health score. Ask one of those, or capture the relevant document in Capture first.",
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
      "No tengo información en tus registros que responda eso. Puedo responder con datos reales sobre: prioridades, trabajo de servicio sin facturar, facturas vencidas, seguimiento de leads, antigüedad de inventario y la puntuación de salud. Pregunta por uno de esos, o captura el documento correspondiente en Capturar.",
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
      "Tôi không có thông tin trong hồ sơ của bạn để trả lời điều đó. Tôi có thể trả lời từ dữ liệu thực tế về: ưu tiên, công việc dịch vụ chưa xuất hóa đơn, hóa đơn quá hạn, theo dõi khách hàng, tồn kho lâu, và điểm sức khỏe. Hãy hỏi một trong những chủ đề đó, hoặc thu thập tài liệu liên quan trong Thu thập trước.",
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
      "لا أملك معلومات في سجلاتك تجيب على ذلك. أستطيع الإجابة من بيانات فعلية عن: الأولويات، عمل الصيانة غير المفوتر، الفواتير المتأخرة، متابعة العملاء، تقادم المخزون، ودرجة الصحة. اسأل عن أحدها، أو التق المستند ذا الصلة في التقاط أولاً.",
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
