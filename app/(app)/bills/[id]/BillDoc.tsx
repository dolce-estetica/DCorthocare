import { money, TAXCLASS, dayKey } from "@/lib/format";

export default function BillDoc({
  bill,
}: {
  bill: {
    billNo: string;
    date: Date;
    subtotal: number;
    discountType: string;
    discountValue: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    notes: string | null;
    patient: { name: string; phone: string; age: number | null; gender: string | null };
    professional: { name: string; role: string };
    items: { name: string; qty: number; rate: number; amount: number; taxClass: string }[];
  };
}) {
  const k = dayKey(bill.date);
  const [y, m, d] = k.split("-");
  return (
    <div className="doc">
      <div className="dhd">
        <img src="/logo.png" alt="" />
        <div className="t">
          <b>DC ORTHO CARE</b><br />
          Orthopaedics · Sports Medicine · Physiotherapy &amp; Regenerative Medicine<br />
          Opp. Municipal Bus Stand, Round East, Thrissur, Kerala 680001<br />
          Ph: +91 00000 00000 · dcorothocare@example.com
        </div>
        <div style={{ textAlign: "right", fontSize: 11 }}>
          <b>BILL / CASH RECEIPT</b><br />
          No: <b>{bill.billNo}</b><br />
          Date: {d}-{m}-{y}
        </div>
      </div>

      <div className="meta">
        <div>
          <b>Patient:</b> {bill.patient.name}{" "}
          {bill.patient.age != null ? `(${bill.patient.age}${bill.patient.gender === "F" ? "F" : bill.patient.gender === "M" ? "M" : ""})` : ""} · Ph: {bill.patient.phone}
        </div>
        <div>
          <b>Attending:</b> {bill.professional.name} ({bill.professional.role === "PHYSIO" ? "Physiotherapist" : "Doctor"})
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Service</th>
            <th>Tax</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((i, n) => (
            <tr key={n}>
              <td>{n + 1}</td>
              <td>{i.name}</td>
              <td>{TAXCLASS[i.taxClass]?.tag || "Exempt"}</td>
              <td className="num">{i.qty}</td>
              <td className="num">{money(i.rate)}</td>
              <td className="num">{money(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="tot">
        <span>Subtotal</span>
        <span>{money(bill.subtotal)}</span>
      </div>
      {bill.discountAmount > 0 && (
        <div className="tot">
          <span>Discount{bill.discountType === "PERCENT" ? ` (${bill.discountValue}%)` : ""}</span>
          <span>− {money(bill.discountAmount)}</span>
        </div>
      )}
      {bill.taxAmount > 0 && (
        <div className="tot">
          <span>GST (goods / aesthetic services)</span>
          <span>{money(bill.taxAmount)}</span>
        </div>
      )}
      <div className="tot big">
        <span>TOTAL PAYABLE</span>
        <span>{money(bill.total)}</span>
      </div>
      {bill.notes && <div className="fine">Note: {bill.notes}</div>}

      <div className="sign">
        <div>Computer-generated bill · DC Ortho Care</div>
        <div>For DC Ortho Care<br /><br /><br />____________________</div>
      </div>
      <div className="fine">
        Healthcare services by a clinical establishment are GST-exempt. GST applies only to goods and
        cosmetic/aesthetic services as itemised above. Goods once sold are not returnable. This bill is
        payable on presentation; dues may be settled at the front desk.
      </div>
    </div>
  );
}
