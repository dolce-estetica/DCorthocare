"use client";

export default function Burger() {
  return (
    <button
      className="btn ghost sm"
      id="burger"
      onClick={() => document.getElementById("side")?.classList.toggle("open")}
    >
      ☰
    </button>
  );
}
