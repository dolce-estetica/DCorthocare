"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await signIn("credentials", { redirect: false, username, password });
    setBusy(false);
    if (res?.error) {
      setErr("Wrong username or password.");
      return;
    }
    router.push("/clinic");
    router.refresh();
  }

  return (
    <form className="signbox" onSubmit={submit}>
      <label className="lk">Username</label>
      <input
        type="text"
        value={username}
        autoCapitalize="characters"
        autoComplete="username"
        onChange={(e) => setUsername(e.target.value)}
        placeholder="DCORTHO"
      />
      <label className="lk" style={{ marginTop: 10 }}>Password</label>
      <div className="pwrap" style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <button
          type="button"
          className="eyebtn"
          onClick={() => setShow((s) => !s)}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <div className="lkerr">{err}</div>
      <button className="btn gold lg" style={{ width: "100%" }} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <div className="firsttime">
        First time on this app?<br />
        Admin: <b>DCORTHO / DC@1234</b><br />
        Change passwords in <b>Users &amp; Roles</b> after first login.
      </div>
    </form>
  );
}
