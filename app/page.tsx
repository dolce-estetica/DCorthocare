// The real app is public/index.html, served at "/" via a beforeFiles rewrite
// in next.config.mjs. This route only exists so Next.js has a root route
// handler; it is never rendered in normal use.
export default function Page() {
  return null;
}
