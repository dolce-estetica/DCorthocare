import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { money, dayKey } from "@/lib/format";
import { addPatient } from "@/app/actions";
import PageHeader from "../PageHeader";

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) || "").trim();

  const patients = await prisma.patient.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
      : undefined,
    include: { bills: { include: { payments: true }, orderBy: { date: "desc" } } },
    orderBy: { name: "asc" },
    take: 300,
  });

  const rows = patients.map((p) => {
    const billed = p.bills.reduce((s, b) => s + b.total, 0);
    const paid = p.bills.reduce((s, b) => s + b.payments.reduce((x, x2) => x + x2.amount, 0), 0);
    return {
      ...p,
      nBills: p.bills.length,
      last: p.bills[0]?.date || null,
      billed,
      balance: Math.round((billed - paid) * 100) / 100,
    };
  });

  return (
    <>
      <PageHeader title="Patients" sub={`${rows.length} patient records`}>
        <Link className="btn sm gold" href="/billing/new">＋ New Bill</Link>
      </PageHeader>
      <main id="view">
        <div className="grid split wide">
          <div>
            <div className="filterbar">
              <form method="get" action="/patients">
                <input type="text" name="q" defaultValue={q} placeholder="Search name / phone" style={{ width: 240 }} />
                <button className="btn sm">Search</button>
              </form>
            </div>
            <div className="card">
              <div className="tw" style={{ boxShadow: "none", border: "none" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Age/Sex</th>
                      <th className="num">Bills</th>
                      <th className="num">Billed</th>
                      <th className="num">Balance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={7}><div className="empty"><div className="big">👤</div>No patients found.</div></td></tr>
                    )}
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td><b>{p.name}</b></td>
                        <td>{p.phone}</td>
                        <td>{p.age != null ? `${p.age} / ${p.gender || "—"}` : "—"}</td>
                        <td className="num">{p.nBills}</td>
                        <td className="num">{money(p.billed)}</td>
                        <td className="num" style={{ color: p.balance > 0.009 ? "var(--bad)" : undefined }}>
                          {money(p.balance)}
                        </td>
                        <td className="billrowactions">
                          <Link className="btn sm ghost" href={`/billing/new?patient=${p.id}`}>Bill</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="card pad" style={{ position: "sticky", top: 76 }}>
            <h3>Register patient</h3>
            <form action={addPatient}>
              <div className="f">
                <label>Full name *</label>
                <input name="name" required placeholder="Patient name" />
              </div>
              <div className="f">
                <label>Phone *</label>
                <input name="phone" required placeholder="10-digit mobile" />
              </div>
              <div className="duet">
                <div className="f">
                  <label>Age</label>
                  <input name="age" type="number" min={0} max={120} />
                </div>
                <div className="f">
                  <label>Gender</label>
                  <select name="gender" defaultValue="M">
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </div>
              </div>
              <div className="f">
                <label>Address</label>
                <input name="address" placeholder="Town (optional)" />
              </div>
              <button className="btn" style={{ width: "100%" }}>Add patient</button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
