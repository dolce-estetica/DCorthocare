import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/clinic");
  return (
    <div className="lock">
      <img src="/logo.png" alt="DC Ortho Care" />
      <LoginForm />
      <div className="lkfoot">
        DC Ortho Care · Books &amp; Billing · v5 · Accounts are managed by the clinic admin —
        data is stored centrally in PostgreSQL.
      </div>
    </div>
  );
}
