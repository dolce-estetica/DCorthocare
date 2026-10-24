import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/format";
import { addUser, toggleUser, updateUser } from "@/app/actions";
import PageHeader from "../PageHeader";

export const dynamic = "force-dynamic";

const ROLE_OPTS: [string, string][] = [
  ["ADMIN", "Administrator — everything incl. accounts dashboard"],
  ["DOCTOR", "Doctor — billing, patients, own dashboard"],
  ["PHYSIO", "Physiotherapist — billing, patients, own dashboard"],
  ["STAFF", "Front desk — billing and patients, no admin"],
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/clinic");

  const sp = await searchParams;
  const editId = (Array.isArray(sp.edit) ? sp.edit[0] : sp.edit) || "";
  const users = await prisma.user.findMany({ include: { _count: { select: { bills: true } } }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const editing = editId ? users.find((u) => u.id === editId) : null;

  return (
    <>
      <PageHeader title="Users & Roles" sub="Who can sign in, and what they can see" />
      <main id="view">
        <div className="alert i" style={{ marginBottom: 14 }}>
          <span>●</span>
          <div>
            People are added in the <b>clinic app</b>: <b>Doctors &amp; Physios</b> for doctors and physiotherapists,
            and <b>Staff &amp; Salary → ＋ Staff</b> for reception, housekeeping and everyone else — tick
            &quot;can sign in&quot; there and the login is created automatically. This page is for managing the
            sign-in accounts afterwards: rename, change the password or role, or disable.
          </div>
        </div>
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
                      <td style={{ whiteSpace: "nowrap" }}>
                        {u.id === session.user?.id ? (
                          <span className="hint">you</span>
                        ) : (
                          <>
                            <Link className="btn sm ghost" href={`/users?edit=${u.id}`}>Edit</Link>{" "}
                            <form action={toggleUser} style={{ display: "inline" }}>
                              <input type="hidden" name="id" value={u.id} />
                              <button className="btn sm ghost">{u.active ? "Disable" : "Enable"}</button>
                            </form>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card pad" style={{ position: "sticky", top: 76 }}>
            {editing ? (
              <>
                <h3>Edit account — {editing.username}</h3>
                <form action={updateUser}>
                  <input type="hidden" name="id" value={editing.id} />
                  <div className="f">
                    <label>Display name *</label>
                    <input name="name" required defaultValue={editing.name} />
                  </div>
                  <div className="f">
                    <label>New password (leave blank to keep the current one)</label>
                    <input name="password" type="password" minLength={6} placeholder="min 6 characters" />
                  </div>
                  <div className="f">
                    <label>Role</label>
                    <select name="role" defaultValue={editing.role}>
                      {ROLE_OPTS.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn" style={{ width: "100%" }}>Save changes</button>
                </form>
                <Link className="btn sm ghost" href="/users" style={{ marginTop: 8 }}>Cancel</Link>
                <div className="hint" style={{ marginTop: 10 }}>
                  Changing the password here takes effect immediately at the sign-in screen. The person
                  should also be told their new password.
                </div>
              </>
            ) : (
              <>
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
                      {ROLE_OPTS.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn" style={{ width: "100%" }}>Create user</button>
                </form>
                <div className="hint" style={{ marginTop: 10 }}>
                  Passwords are stored as bcrypt hashes. Doctors and physiotherapists appear in the
                  billing &quot;attending professional&quot; list and in the admin revenue breakdown.
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
