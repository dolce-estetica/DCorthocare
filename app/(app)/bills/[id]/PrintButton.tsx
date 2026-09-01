"use client";

export default function PrintButton() {
  return (
    <button className="btn sm ghost printbtn" onClick={() => window.print()}>
      🖨 Print (A5)
    </button>
  );
}
