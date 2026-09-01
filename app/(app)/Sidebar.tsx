"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type Item = { href: string; icon: string; label: string };

export default function Sidebar({ groups, who, role }: { groups: { title: string; items: Item[] }[]; who: string; role: string }) {
  const pathname = usePathname();
  return (
    <>
      <div id="nav">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="navgrp">{g.title}</div>
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} className={"navlink" + (pathname.startsWith(it.href) ? " on" : "")}>
                <span className="ic">{it.icon}</span>
                {it.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div id="who">
        <span className="dot"></span>
        <div>
          <b>{who}</b>
          <div>{role}</div>
        </div>
        <button className="out btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => signOut({ redirectTo: "/login" })}>
          Sign out
        </button>
      </div>
    </>
  );
}
