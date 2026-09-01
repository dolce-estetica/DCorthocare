import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money, dayKey, statusOf } from "@/lib/format";
import PageHeader from "../PageHeader";

export const dynamic = "force-dynamic";

function dmy(d: Date | string) {
  const k = dayKey(d);
  const [y, m, dd] = k.split("-");
  return `${dd}-${m}-${y}`;
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string)) || "";
  const q = one("q").trim();
  const status = one("status").toUpperCase();

  const bills = await prisma.bill.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { billNo: { contains: q, mode: "insensitive" } },
              { patient: { name: { contains: q, mode: "insensitive" } } },
              { patient: { phone: { contains: q } } },
            ],
          }
        : {}),
    },
    include: { patient: true, professional: true, payments: true },
    orderBy: { date: "desc" },
    take: 200,
  });

  const rows = bills
    .map((b) => ({ ...b, paid: b.payments.reduce((s, p) => s + p.amount, 0) }))
    .map((b) => ({ ...b, status: statusOf(b.total, b.paid) }))
    .filter((b) => !status || b.status === status);

  const totals = rows.reduce(
    (a, b) => ({ billed: a.billed + b.total, paid: a.paid + b.paid }),
    { billed: 0, paid: 0 }
  );

  return (
    <>
      <PageHeader title="Bills & Dues" sub={`${rows.length} bills · billed ${money(totals.billed)} · collected ${money(totals.paid)}`}>
        <Link className="btn sm gold" href="/billing/new">＋ New Bill</Link>
      </PageHeader>
      <main id="view">
        <div className="filterbar">
          {[
            ["", "All"],
            ["PAID", "Paid"],
            ["PARTIAL", "Partial"],
            ["DUE", "Due"],
          ].map(([k, label]) => (
            <Link key={k || "all"} href={k ? `/bills?status=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}` : "/bills"} className={"pill" + (status === k ? " on" : "")}>
              {label}
            </Link>
          ))}
          <form method="get" action="/bills">
            {status && <input type="hidden" name="status" value={status} />}
            <input type="text" name="q" defaultValue={q} placeholder="Search bill no / patient / phone" style={{ width: 250 }} />
            <button className="btn sm">Search</button>
          </form>
        </div>

        <div className="card">
          <div className="tw" style={{ boxShadow: "none", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Bill no</th>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Doctor / Physio</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty"><div className="big">📄</div>No bills found.</div>
                    </td>
                  </tr>
                )}
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td><a href={`/bills/${b.id}`}><b>{b.billNo}</b></a></td>
                    <td>{dmy(b.date)}</td>
                    <td>{b.patient.name}<div className="hint">{b.patient.phone}</div></td>
                    <td>{b.professional.name}</td>
                    <td className="num">{money(b.total)}</td>
                    <td className="num">{money(b.paid)}</td>
                    <td className="num" style={{ color: b.total - b.paid > 0.009 ? "var(--bad)" : undefined }}>
                      {money(b.total - b.paid)}
                    </td>
                    <td>
                      <span className={"chip statuspill " + (b.status === "PAID" ? "ok" : b.status === "PARTIAL" ? "warn" : "bad")}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
