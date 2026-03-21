// ============================================================
// EMAIL CLASSIFIER
// Stage 1: Fast rule-based classification (free, instant)
// Stage 2: AI classification only for ambiguous emails
// ============================================================

// ── Keyword lists ─────────────────────────────────────────
const PAYMENT_KEYWORDS = [
  "שכר לימוד",
  "תשלום",
  "חשבונית",
  "קבלה",
  "payment",
  "invoice",
  "tuition",
  "fee",
];
const ADMIN_KEYWORDS = [
  "רישום",
  "הרשמה",
  "אישור",
  "מסמך",
  "טופס",
  "registration",
  "enrollment",
  "certificate",
  "transcript",
  "form",
];
const URGENT_KEYWORDS = [
  "דחוף",
  "מיידי",
  "urgent",
  "immediate",
  "deadline",
  "asap",
  "חשוב",
];
const ACTION_KEYWORDS = [
  "נדרש",
  "יש למלא",
  "יש להגיש",
  "please submit",
  "action required",
  "respond by",
  "יש לאשר",
];

function containsAny(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function classifyEmail(email) {
  const text = `${email.subject} ${email.snippet} ${email.from}`;
  let category = "general";
  let urgency = "normal";
  let actionRequired = false;

  if (containsAny(text, PAYMENT_KEYWORDS)) category = "payment";
  else if (containsAny(text, ADMIN_KEYWORDS)) category = "admin";

  if (containsAny(text, URGENT_KEYWORDS)) urgency = "high";
  if (containsAny(text, ACTION_KEYWORDS)) actionRequired = true;

  return { ...email, category, urgency, actionRequired };
}

export function classifyAll(emails) {
  return emails.map(classifyEmail);
}

export const CATEGORY_CONFIG = {
  payment: { label: "💳 Payment", color: "#e74c3c" },
  admin: { label: "📋 Admin", color: "#3498db" },
  general: { label: "📧 General", color: "#95a5a6" },
};

export const URGENCY_CONFIG = {
  high: { label: "🔴 Urgent", color: "#e74c3c" },
  normal: { label: "", color: "transparent" },
};
