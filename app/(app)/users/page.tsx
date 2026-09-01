import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/format";
import { addUser, toggleUser } from "@/app/actions";
import PageHeader from "../PageHeader";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({ include: { _count: { select: { bills: true } } }, orderBy: [{ role: "asc" }, { name: "asc" }] });

  return (
    <>
      <PageHeader title="Users & Roles" sub="Who can sign in, and what they can see" />
      <main id="view">
        <div className="grid split wide">
          <div className="card">
            <h3 style={{ padding: "14px 16px 0" }}>Accounts</h3>
            <div className="tw" style={{ boxShadow: "none", border: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th className="num">Bills attributed</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                      <td><b>{u.username}</b></td>
                      <td>{u.name}</td>
                      <td><span className={"chip " + (u.role === "ADMIN" ? "gold" : "info")}>{roleLabel(u.role)}</span></td>
                      <td className="num">{u._count.bills}</td>
                      <td>
                        <span className={"chip " + (u.active ? "ok" : "bad")}>{u.active ? "Active" : "Disabled"}</span>
                      </td>
                      <td>
                        {u.id !== session.user?.id && (
                          <form action={toggleUser}>
                            <input type="hidden" name="id" value={u.id} />
                            <button className="btn sm ghost">{u.active ? "Disable" : "Enable"}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card pad" style={{ position: "sticky", top: 76 }}>
            <h3>Add user</h3>
            <form action={addUser}>
              <div className="f">
                <label>Username *</label>
                <input name="username" required placeholder="e.g. DRDHANIL" style={{ textTransform: "uppercase" }} />
              </div>
              <div className="f">
                <label>Display name *</label>
                <input name="name" required placeholder="e.g. Dr. Dhanil Charly" />
              </div>
              <div className="f">
                <label>Password * (min 6 chars)</label>
                <input name="password" type="password" required minLength={6} />
              </div>
              <div className="f">
                <label>Role</label>
                <select name="role" defaultValue="STAFF">
                  <option value="ADMIN">Administrator — everything incl. admin dashboard</option>
                  <option value="DOCTOR">Doctor — billing, patients, own dashboard</option>
                  <option value="PHYSIO">Physiotherapist — billing, patients, own dashboard</option>
                  <option value="STAFF">Front desk — billing and patients, no admin</option>
                </select>
              </div>
              <button className="btn" style={{ width: "100%" }}>Create user</button>
            </form>
            <div className="hint" style={{ marginTop: 10 }}>
              Passwords are stored as bcrypt hashes. Doctors and physiotherapists appear in the
              billing &quot;attending professional&quot; list and in the admin revenue breakdown.
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
