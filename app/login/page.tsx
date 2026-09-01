import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/clinic");
  return (
    <div className="lock">
      <div className="logochip" style={{ maxWidth: 250, marginBottom: 12 }}>
        <img src="/logo.png" alt="DC Ortho Care" style={{ width: "100%" }} />
      </div>
      <LoginForm />
      <div className="lkfoot">
        DC Ortho Care · Books &amp; Billing · v6 · Sign in with your clinic account —
        data is stored centrally in PostgreSQL.
      </div>
    </div>
  );
}
