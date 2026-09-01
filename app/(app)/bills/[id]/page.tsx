import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money, dayKey, statusOf } from "@/lib/format";
import { addPayment } from "@/app/actions";
import BillDoc from "./BillDoc";
import PrintButton from "./PrintButton";
import PageHeader from "../../PageHeader";

export const dynamic = "force-dynamic";

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const bill = await prisma.bill.findUnique({
    where: { id },
    include: { patient: true, professional: true, items: true, payments: { orderBy: { date: "asc" } } },
  });
  if (!bill) notFound();

  const paid = bill.payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.round((bill.total - paid) * 100) / 100;
  const status = statusOf(bill.total, paid);

  function dmy(d: Date) {
    const k = dayKey(d);
    const [y, m, dd] = k.split("-");
    return `${dd}-${m}-${y}`;
  }

  return (
    <>
      <PageHeader title={`Bill ${bill.billNo}`} sub={`${dmy(bill.date)} · ${bill.patient.name} · ${status}`}>
        <PrintButton />
        <Link className="btn sm ghost" href="/bills">All bills</Link>
        <Link className="btn sm gold" href={`/billing/new?patient=${bill.patientId}`}>Bill again</Link>
      </PageHeader>
      <main id="view">
        <div className="grid split wide">
          <div className="card pad">
            <h3>Invoice</h3>
            <BillDoc bill={bill} />
          </div>
          <div>
            <div className="card pad" style={{ marginBottom: 14 }}>
              <h3>Payments</h3>
              <div className="tot"><span>Total payable</span><span><b>{money(bill.total)}</b></span></div>
              <div className="tot"><span>Received</span><span>{money(paid)}</span></div>
              <div className="tot big"><span>Balance</span><span style={{ color: balance > 0 ? "var(--bad)" : "var(--ok)" }}>{money(balance)}</span></div>
              {bill.payments.length > 0 && (
                <table style={{ marginTop: 10 }}>
                  <thead>
                    <tr><th>Date</th><th>Mode</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {bill.payments.map((p) => (
                      <tr key={p.id}>
                        <td>{dmy(p.date)}</td>
                        <td><span className="chip">{p.mode}</span></td>
                        <td className="num">{money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {balance > 0 ? (
                <form action={addPayment} style={{ marginTop: 14 }}>
                  <input type="hidden" name="billId" value={bill.id} />
                  <div className="duet">
                    <div className="f">
                      <label>Collect now (₹)</label>
                      <input name="amount" type="number" min={1} max={balance} step="0.01" defaultValue={balance} required />
                    </div>
                    <div className="f">
                      <label>Mode</label>
                      <select name="mode" defaultValue="CASH">
                        <option value="CASH">CASH</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">CARD</option>
                        <option value="BANK">BANK</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn" style={{ width: "100%" }}>Record payment</button>
                </form>
              ) : (
                <div className="alert s" style={{ marginTop: 10 }}>✓ Fully paid — thank you!</div>
              )}
            </div>
            <div className="card pad noprint">
              <h3>Summary</h3>
              <div className="tot"><span>Items</span><span>{bill.items.length}</span></div>
              <div className="tot"><span>Subtotal</span><span>{money(bill.subtotal)}</span></div>
              <div className="tot"><span>Discount</span><span>− {money(bill.discountAmount)}{bill.discountType === "PERCENT" ? ` (${bill.discountValue}%)` : bill.discountType === "AMOUNT" ? ` (₹${bill.discountValue})` : ""}</span></div>
              <div className="tot"><span>GST</span><span>{money(bill.taxAmount)}</span></div>
              {bill.notes && <div className="hint" style={{ marginTop: 8 }}>Note: {bill.notes}</div>}
            </div>
          </div>
        </div>
      </main>
      <div id="print"><BillDoc bill={bill} /></div>
    </>
  );
}
