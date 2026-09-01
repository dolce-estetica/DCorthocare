"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /* Direct DOM toggle — works regardless of hydration timing */
  function toggleShow() {
    const pw = document.getElementById("pw") as HTMLInputElement | null;
    const eye = document.getElementById("eye");
    if (!pw || !eye) return;
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    eye.textContent = show ? "Hide" : "Show";
    pw.focus();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr("");
    const res = await signIn("credentials", {
      redirect: false,
      username: String(fd.get("username") || ""),
      password: String(fd.get("password") || ""),
    });
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
      <label className="lk" htmlFor="uin">Username</label>
      <input
        id="uin"
        name="username"
        type="text"
        autoCapitalize="characters"
        autoComplete="username"
        spellCheck={false}
        required
      />
      <label className="lk" htmlFor="pw" style={{ marginTop: 10 }}>Password</label>
      <div className="pwrap" style={{ position: "relative" }}>
        <input
          id="pw"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          style={{ paddingRight: 76 }}
        />
        <button type="button" className="eyebtn" id="eye" onClick={toggleShow}>
          Show
        </button>
      </div>
      <div className="lkerr">{err}</div>
      <button className="btn gold lg" style={{ width: "100%" }} disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
