export const R = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
export const money = (n: any) =>
  "₹" +
  R(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n: any) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
export const esc = (s: any) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export const TAXCLASS: Record<string, { label: string; rate: number; tag: string }> = {
  exempt: { label: "Exempt (healthcare)", rate: 0, tag: "Exempt" },
  gst5: { label: "GST 5%", rate: 5, tag: "5%" },
  gst12: { label: "GST 12%", rate: 12, tag: "12%" },
  gst18: { label: "GST 18%", rate: 18, tag: "18%" },
};

/* All clinic-time math happens in IST regardless of server timezone */
const IST = "Asia/Kolkata";
export const dayKey = (d: Date | string) =>
  new Date(d).toLocaleString("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" });

export const istStartOfDay = (key: string) => new Date(`${key}T00:00:00+05:30`);
export const istEndOfDay = (key: string) =>
  new Date(istStartOfDay(key).getTime() + 24 * 3600 * 1000 - 1);

export const todayKey = () => dayKey(new Date());
export const monthOf = (d: Date | string) => String(dayKey(d)).slice(0, 7);
export const mName = (m: string) => {
  if (!m) return "";
  const [y, mm] = m.split("-");
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mm - 1] + " " + y;
};

/* Indian financial year: Apr–Mar */
export function fyOf(d = new Date()) {
  const dt = new Date(d);
  let y = Number(dayKey(dt).slice(0, 4));
  const m = Number(dayKey(dt).slice(5, 7));
  if (m < 4) y--;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function computeTotals(
  items: { qty: number; rate: number; taxClass: string }[],
  discountType: "NONE" | "PERCENT" | "AMOUNT",
  discountValue: number
) {
  const subtotal = R(items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0));
  let discountAmount = 0;
  if (discountType === "PERCENT") discountAmount = (subtotal * Math.min(100, Math.max(0, discountValue))) / 100;
  else if (discountType === "AMOUNT") discountAmount = Math.min(subtotal, Math.max(0, discountValue));
  discountAmount = R(discountAmount);
  const ratio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxAmount = R(
    items.reduce((s, i) => {
      const gross = (Number(i.qty) || 0) * (Number(i.rate) || 0);
      const rate = (TAXCLASS[i.taxClass] || TAXCLASS.exempt).rate;
      return s + gross * (1 - ratio) * (rate / 100);
    }, 0)
  );
  const total = R(subtotal - discountAmount + taxAmount);
  return { subtotal, discountAmount, taxAmount, total };
}

export const roleLabel = (r: string) =>
  ({ ADMIN: "Administrator", DOCTOR: "Doctor", PHYSIO: "Physiotherapist", STAFF: "Front desk" }[r] || r);

export const statusOf = (total: number, paid: number): "PAID" | "PARTIAL" | "DUE" =>
  paid <= 0.009 ? "DUE" : paid >= total - 0.009 ? "PAID" : "PARTIAL";
