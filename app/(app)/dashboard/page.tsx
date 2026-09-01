import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money, dayKey, todayKey, statusOf } from "@/lib/format";
import PageHeader from "../PageHeader";

export const dynamic = "force-dynamic";

function dmy(d: Date | string) {
  const k = dayKey(d);
  const [y, m, dd] = k.split("-");
  return `${dd}-${m}-${y}`;
}

export default async function DashboardPage() {
  const session = await auth();
  const tk = todayKey();
  const [start, end] = [new Date(`${tk}T00:00:00+05:30`), new Date(`${tk}T23:59:59+05:30`)];

  const todayBills = await prisma.bill.findMany({
    where: { date: { gte: start, lte: end } },
    include: { patient: true, professional: true, payments: true, items: true },
    orderBy: { date: "desc" },
  });
  const todayPayments = await prisma.payment.findMany({
    where: { date: { gte: start, lte: end } },
  });

  const allBills = await prisma.bill.findMany({ include: { payments: true } });
  const pending = allBills.reduce(
    (s, b) => s + (b.total - b.payments.reduce((x, p) => x + p.amount, 0)),
    0
  );

  const billedToday = todayBills.reduce((s, b) => s + b.total, 0);
  const collectedToday = todayPayments.reduce((s, p) => s + p.amount, 0);

  const isAdmin = session?.user?.role === "ADMIN";
  const role = session?.user?.role;
  const myBills =
    role === "DOCTOR" || role === "PHYSIO"
      ? todayBills.filter((b) => b.professionalId === session?.user?.id)
      : todayBills;

  return (
    <>
      <PageHeader title="Dashboard" sub={`Financial year · ${dmy(new Date())}`}>
        <Link className="btn sm" href="/billing/new">＋ New Bill</Link>
        <Link className="btn sm ghost" href="/patients">Patients</Link>
      </PageHeader>
      <main id="view">
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="kpi">
            <div className="l">Billed today</div>
            <div className="v">{money(billedToday)}</div>
            <div className="d">{todayBills.length} bill{todayBills.length === 1 ? "" : "s"}</div>
          </div>
          <div className="kpi acc">
            <div className="l">Collected today</div>
            <div className="v">{money(collectedToday)}</div>
            <div className="d">{todayPayments.length} receipt{todayPayments.length === 1 ? "" : "s"}</div>
          </div>
          <div className="kpi">
            <div className="l">Pending dues (all time)</div>
            <div className="v">{money(pending)}</div>
            <div className="d">from patients</div>
          </div>
          <div className="kpi">
            <div className="l">Avg bill value today</div>
            <div className="v">{money(todayBills.length ? billedToday / todayBills.length : 0)}</div>
            <div className="d">after discount, incl. GST</div>
          </div>
        </div>

        {isAdmin && (
          <div className="card pad" style={{ marginBottom: 14 }}>
            <h3>Admin</h3>
            <div className="row">
              <Link className="btn gold" href="/admin">📈 Open Admin Dashboard</Link>
              <span className="hint">
                Total revenue, per doctor, per physiotherapist, per day / week / month / any period.
              </span>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ padding: "14px 16px 0" }}>Today&apos;s bills</h3>
          <div className="tw" style={{ boxShadow: "none", border: "none", maxHeight: "46vh" }}>
            <table>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Patient</th>
                  <th>{role === "PHYSIO" ? "Physio" : "Doctor / Physio"}</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {myBills.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty">
                        <div className="big">🧾</div>
                        No bills yet today. Hit <b>New Bill</b>.
                      </div>
                    </td>
                  </tr>
                )}
                {myBills.map((b) => {
                  const paid = b.payments.reduce((s, p) => s + p.amount, 0);
                  const st = statusOf(b.total, paid);
                  return (
                    <tr key={b.id}>
                      <td>
                        <a href={`/bills/${b.id}`}>{b.billNo}</a>
                      </td>
                      <td>{b.patient.name}</td>
                      <td>{b.professional.name}</td>
                      <td className="num">{money(b.total)}</td>
                      <td className="num">{money(paid)}</td>
                      <td>
                        <span className={"chip statuspill " + (st === "PAID" ? "ok" : st === "PARTIAL" ? "warn" : "bad")}>
                          {st}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
