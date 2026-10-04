// ─────────────────────────────────────────────────────────────
// CUE i18n. Cookie-based locale, server-first: pages read the
// locale via `getLocale()` and pull strings from the dictionary.
// Adding a language = add a dictionary entry + a LANGUAGES row.
// ─────────────────────────────────────────────────────────────

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦", rtl: true },
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
] as const;

export type Locale = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cue_locale";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.overview": "Overview",
  "nav.pipeline": "Capture → Understand → Enhance → Execute → Expand",
  "nav.company": "Company",
  "nav.dashboard": "Dashboard",
  "nav.compass": "Company Compass",
  "nav.crm": "Pipeline",
  "nav.capture": "Capture",
  "nav.understand": "Understand",
  "nav.enhance": "Enhance",
  "nav.execute": "Execute",
  "nav.expand": "Expand",
  "nav.people": "People",
  "nav.messages": "Messages",
  "nav.signals": "Market Signals",
  "nav.knowledge": "Knowledge",
  "nav.lab": "Innovation Lab",
  "nav.ecosystem": "Connected Ecosystem",
  "nav.settings": "Settings",
  "nav.askAi": "✦ Ask CUE AI",
  "nav.signOut": "Sign out",
  "app.tagline": "The Heart of Your Business",
  "app.signIn": "Sign in",
  "app.signUp": "Create your workspace",
  "app.email": "Work email",
  "app.password": "Password",
  "app.signInCta": "Sign in to CUE",
  "app.language": "Language",
};

const es: Dict = {
  "nav.overview": "Resumen",
  "nav.pipeline": "Capturar → Entender → Mejorar → Ejecutar → Expandir",
  "nav.company": "Empresa",
  "nav.dashboard": "Panel",
  "nav.compass": "Brújula Empresarial",
  "nav.crm": "Embudo",
  "nav.capture": "Capturar",
  "nav.understand": "Entender",
  "nav.enhance": "Mejorar",
  "nav.execute": "Ejecutar",
  "nav.expand": "Expandir",
  "nav.people": "Personas",
  "nav.messages": "Mensajes",
  "nav.signals": "Señales de Mercado",
  "nav.knowledge": "Conocimiento",
  "nav.lab": "Laboratorio de Innovación",
  "nav.ecosystem": "Ecosistema Conectado",
  "nav.settings": "Configuración",
  "nav.askAi": "✦ Pregunta a CUE AI",
  "nav.signOut": "Cerrar sesión",
  "app.tagline": "El Corazón de Tu Negocio",
  "app.signIn": "Iniciar sesión",
  "app.signUp": "Crea tu espacio de trabajo",
  "app.email": "Correo de trabajo",
  "app.password": "Contraseña",
  "app.signInCta": "Inicia sesión en CUE",
  "app.language": "Idioma",
};

const fr: Dict = {
  "nav.overview": "Vue d'ensemble",
  "nav.pipeline": "Capturer → Comprendre → Améliorer → Exécuter → Développer",
  "nav.company": "Entreprise",
  "nav.dashboard": "Tableau de bord",
  "nav.compass": "Compas d'entreprise",
  "nav.crm": "Pipeline",
  "nav.capture": "Capturer",
  "nav.understand": "Comprendre",
  "nav.enhance": "Améliorer",
  "nav.execute": "Exécuter",
  "nav.expand": "Développer",
  "nav.people": "Équipe",
  "nav.messages": "Messages",
  "nav.signals": "Signaux de marché",
  "nav.knowledge": "Connaissances",
  "nav.lab": "Laboratoire d'innovation",
  "nav.ecosystem": "Écosystème connecté",
  "nav.settings": "Paramètres",
  "nav.askAi": "✦ Demander à CUE AI",
  "nav.signOut": "Se déconnecter",
  "app.tagline": "Le Cœur de Votre Entreprise",
  "app.signIn": "Connexion",
  "app.signUp": "Créez votre espace",
  "app.email": "E-mail professionnel",
  "app.password": "Mot de passe",
  "app.signInCta": "Se connecter à CUE",
  "app.language": "Langue",
};

const de: Dict = {
  "nav.overview": "Übersicht",
  "nav.pipeline": "Erfassen → Verstehen → Verbessern → Ausführen → Erweitern",
  "nav.company": "Unternehmen",
  "nav.dashboard": "Dashboard",
  "nav.compass": "Unternehmenskompass",
  "nav.crm": "Pipeline",
  "nav.capture": "Erfassen",
  "nav.understand": "Verstehen",
  "nav.enhance": "Verbessern",
  "nav.execute": "Ausführen",
  "nav.expand": "Erweitern",
  "nav.people": "Team",
  "nav.messages": "Nachrichten",
  "nav.signals": "Marktsignale",
  "nav.knowledge": "Wissen",
  "nav.lab": "Innovationslabor",
  "nav.ecosystem": "Verbundenes Ökosystem",
  "nav.settings": "Einstellungen",
  "nav.askAi": "✦ CUE AI fragen",
  "nav.signOut": "Abmelden",
  "app.tagline": "Das Herz Ihres Unternehmens",
  "app.signIn": "Anmelden",
  "app.signUp": "Arbeitsbereich erstellen",
  "app.email": "Geschäftliche E-Mail",
  "app.password": "Passwort",
  "app.signInCta": "Bei CUE anmelden",
  "app.language": "Sprache",
};

const ar: Dict = {
  "nav.overview": "نظرة عامة",
  "nav.pipeline": "التقاط ← فهم ← تحسين ← تنفيذ ← توسيع",
  "nav.company": "الشركة",
  "nav.dashboard": "لوحة القيادة",
  "nav.compass": "بوصلة الشركة",
  "nav.crm": "خط الأنابيب",
  "nav.capture": "التقاط",
  "nav.understand": "فهم",
  "nav.enhance": "تحسين",
  "nav.execute": "تنفيذ",
  "nav.expand": "توسيع",
  "nav.people": "الموظفون",
  "nav.messages": "الرسائل",
  "nav.signals": "إشارات السوق",
  "nav.knowledge": "المعرفة",
  "nav.lab": "مختبر الابتكار",
  "nav.ecosystem": "المنظومة المتصلة",
  "nav.settings": "الإعدادات",
  "nav.askAi": "✦ اسأل CUE AI",
  "nav.signOut": "تسجيل الخروج",
  "app.tagline": "قلب عملك النابض",
  "app.signIn": "تسجيل الدخول",
  "app.signUp": "أنشئ مساحة عملك",
  "app.email": "البريد الإلكتروني للعمل",
  "app.password": "كلمة المرور",
  "app.signInCta": "تسجيل الدخول إلى CUE",
  "app.language": "اللغة",
};

const vi: Dict = {
  "nav.overview": "Tổng quan",
  "nav.pipeline": "Thu thập → Hiểu → Nâng cao → Thực hiện → Mở rộng",
  "nav.company": "Công ty",
  "nav.dashboard": "Bảng điều khiển",
  "nav.compass": "La bàn Công ty",
  "nav.crm": "Kế hoạch bán hàng",
  "nav.capture": "Thu thập",
  "nav.understand": "Hiểu",
  "nav.enhance": "Nâng cao",
  "nav.execute": "Thực hiện",
  "nav.expand": "Mở rộng",
  "nav.people": "Nhân sự",
  "nav.messages": "Tin nhắn",
  "nav.signals": "Tín hiệu Thị trường",
  "nav.knowledge": "Kiến thức",
  "nav.lab": "Phòng thí nghiệm Đổi mới",
  "nav.ecosystem": "Hệ sinh thái Kết nối",
  "nav.settings": "Cài đặt",
  "nav.askAi": "✦ Hỏi CUE AI",
  "nav.signOut": "Đăng xuất",
  "app.tagline": "Trái tim của doanh nghiệp bạn",
  "app.signIn": "Đăng nhập",
  "app.signUp": "Tạo không gian làm việc",
  "app.email": "Email công việc",
  "app.password": "Mật khẩu",
  "app.signInCta": "Đăng nhập vào CUE",
  "app.language": "Ngôn ngữ",
};

const pt: Dict = {
  "nav.overview": "Visão geral",
  "nav.pipeline": "Capturar → Entender → Aprimorar → Executar → Expandir",
  "nav.company": "Empresa",
  "nav.dashboard": "Painel",
  "nav.compass": "Bússola Empresarial",
  "nav.crm": "Funil",
  "nav.capture": "Capturar",
  "nav.understand": "Entender",
  "nav.enhance": "Aprimorar",
  "nav.execute": "Executar",
  "nav.expand": "Expandir",
  "nav.people": "Equipe",
  "nav.messages": "Mensagens",
  "nav.signals": "Sinais de Mercado",
  "nav.knowledge": "Conhecimento",
  "nav.lab": "Laboratório de Inovação",
  "nav.ecosystem": "Ecossistema Conectado",
  "nav.settings": "Configurações",
  "nav.askAi": "✦ Pergunte ao CUE AI",
  "nav.signOut": "Sair",
  "app.tagline": "O Coração do Seu Negócio",
  "app.signIn": "Entrar",
  "app.signUp": "Crie seu espaço de trabalho",
  "app.email": "E-mail comercial",
  "app.password": "Senha",
  "app.signInCta": "Entrar no CUE",
  "app.language": "Idioma",
};

export const DICTIONARIES: Record<Locale, Dict> = { en, es, fr, de, pt, ar, vi };

/** Locales that read right-to-left — the app shell flips direction for them. */
export const RTL_LOCALES: Locale[] = ["ar"];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function translate(locale: Locale, key: string): string {
  return DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && LANGUAGES.some((l) => l.code === value);
}
