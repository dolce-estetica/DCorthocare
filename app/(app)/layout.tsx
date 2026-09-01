import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { roleLabel } from "@/lib/format";
import Sidebar from "./Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;

  const groups: { title: string; items: { href: string; icon: string; label: string }[] }[] = [
    {
      title: "Daily work",
      items: [
        { href: "/dashboard", icon: "📊", label: "Dashboard" },
        { href: "/billing/new", icon: "🧾", label: "New Bill" },
        { href: "/bills", icon: "📄", label: "Bills & Dues" },
        { href: "/patients", icon: "👤", label: "Patients" },
      ],
    },
  ];
  if (role === "ADMIN") {
    groups.push({
      title: "Admin",
      items: [
        { href: "/admin", icon: "📈", label: "Admin Dashboard" },
        { href: "/users", icon: "👥", label: "Users & Roles" },
      ],
    });
  }

  return (
    <div id="app">
      <aside id="side">
        <div className="brand">
          <div className="logochip">
            <img src="/logo.png" alt="DC Ortho Care" />
          </div>
          <div className="sub2">Books &amp; Billing</div>
        </div>
        <Sidebar groups={groups} who={session.user.name || ""} role={roleLabel(role)} />
        <div className="foot">
          Central data · PostgreSQL + NextAuth.<br />
          Every device sees the same books.
        </div>
      </aside>
      <div id="main">{children}</div>
    </div>
  );
}
