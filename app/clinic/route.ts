import fs from "fs";
import path from "path";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

let cached: string | null = null;

/* Serves the original clinic app (verbatim) behind NextAuth. The per-request
   signed-in username is injected so the app auto-signs-in the right person. */
export async function GET() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!cached) cached = fs.readFileSync(path.join(process.cwd(), "clinic-app.html"), "utf8");
  const inject = JSON.stringify({
    username: session.user.username || "",
    name: session.user.name || "",
  });
  const html = cached.replace("__NA_USER_JSON__", () => inject);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
