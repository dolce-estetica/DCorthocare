"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { money, TAXCLASS } from "@/lib/format";

type Svc = { id: string; code: string; name: string; malayalam: string | null; category: string; price: number; taxClass: string };
type Pat = { id: string; name: string; phone: string };
type Pro = { id: string; name: string; role: string };
type Line = { key: string; serviceId: string; name: string; qty: number; rate: number; taxClass: string };

export default function NewBillClient({
  services,
  patients,
  professionals,
  defaultProfessionalId,
  preselectPatientId,
}: {
  services: Svc[];
  patients: Pat[];
  professionals: Pro[];
  defaultProfessionalId: string;
  preselectPatientId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [lines, setLines] = useState<Line[]>([]);
  const [patientId, setPatientId] = useState(preselectPatientId);
  const [newPatient, setNewPatient] = useState({ name: "", phone: "", age: "", gender: "M" });
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId);
  const [discountType, setDiscountType] = useState<"NONE" | "PERCENT" | "AMOUNT">("NONE");
  const [discountValue, setDiscountValue] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payFull, setPayFull] = useState(true);
  const [payMode, setPayMode] = useState("UPI");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const categories = useMemo(() => ["All", ...new Set(services.map((s) => s.category))], [services]);
  const shown = useMemo(
    () =>
      services.filter(
        (s) =>
          (cat === "All" || s.category === cat) &&
          (!q || (s.name + " " + (s.malayalam || "") + " " + s.code).toLowerCase().includes(q.toLowerCase()))
      ),
    [services, q, cat]
  );

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, i) => s + i.qty * i.rate, 0);
    let discountAmount = 0;
    const dv = Number(discountValue) || 0;
    if (discountType === "PERCENT") discountAmount = (subtotal * Math.min(100, Math.max(0, dv))) / 100;
    else if (discountType === "AMOUNT") discountAmount = Math.min(subtotal, Math.max(0, dv));
    const ratio = subtotal > 0 ? discountAmount / subtotal : 0;
    const taxAmount = lines.reduce(
      (s, i) => s + i.qty * i.rate * (1 - ratio) * ((TAXCLASS[i.taxClass] || TAXCLASS.exempt).rate / 100),
      0
    );
    const total = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;
    return { subtotal, discountAmount, taxAmount, total };
  }, [lines, discountType, discountValue]);

  function addSvc(s: Svc) {
    setLines((ls) => {
      const ex = ls.find((l) => l.serviceId === s.id);
      if (ex) return ls.map((l) => (l.serviceId === s.id ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: s.id + "_" + Math.random().toString(36).slice(2, 6), serviceId: s.id, name: s.name, qty: 1, rate: s.price, taxClass: s.taxClass }];
    });
  }
  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const usePatient = patientId || (newPatient.name.trim() && newPatient.phone.trim() ? "NEW" : "");

  async function save() {
    setErr("");
    if (!lines.length) return setErr("Add at least one service to the bill.");
    if (!usePatient) return setErr("Pick an existing patient or fill new patient name + phone.");
    if (!professionalId) return setErr("Pick the doctor / physiotherapist.");
    setBusy(true);
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: patientId || null,
        newPatient: patientId ? null : { name: newPatient.name.trim(), phone: newPatient.phone.trim(), age: newPatient.age ? Number(newPatient.age) : null, gender: newPatient.gender },
        professionalId,
        items: lines.map((l) => ({ serviceId: l.serviceId, name: l.name, qty: l.qty, rate: l.rate, taxClass: l.taxClass })),
        discountType,
        discountValue: Number(discountValue) || 0,
        payAmount: payFull ? totals.total : Number(payAmount) || 0,
        payMode,
        notes: notes.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error || "Could not save the bill.");
    router.push(`/bills/${data.id}`);
  }

  return (
    <div className="grid split wide">
      <div>
        <div className="card pad" style={{ marginBottom: 14 }}>
          <h3>Patient &amp; professional</h3>
          <div className="duet">
            <div className="f">
              <label>Existing patient</label>
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">— new patient —</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.phone}
                  </option>
                ))}
              </select>
            </div>
            <div className="f">
              <label>Doctor / Physiotherapist</label>
              <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.role === "PHYSIO" ? "Physio" : "Doctor"})
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!patientId && (
            <div className="duet">
              <div className="f">
                <label>New patient name</label>
                <input value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="Full name" />
              </div>
              <div className="f">
                <label>Phone</label>
                <input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="10-digit mobile" />
              </div>
              <div className="f">
                <label>Age</label>
                <input type="number" value={newPatient.age} onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })} />
              </div>
              <div className="f">
                <label>Gender</label>
                <select value={newPatient.gender} onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="card pad" style={{ marginBottom: 14 }}>
          <h3>Pick services</h3>
          <div className="row" style={{ marginBottom: 10 }}>
            <input type="text" placeholder="Search service / മലയാളം…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          </div>
          <div className="tabs" style={{ marginBottom: 10 }}>
            {categories.map((c) => (
              <div key={c} className={"tab" + (cat === c ? " on" : "")} onClick={() => setCat(c)}>
                {c}
              </div>
            ))}
          </div>
          <div className="svcpick">
            {shown.map((s) => (
              <button type="button" key={s.id} className="svcbtn" onClick={() => addSvc(s)}>
                <b>{s.name}</b>
                {s.malayalam ? <small>{s.malayalam}</small> : null}
                <div className="p">
                  {money(s.price)}
                  {(TAXCLASS[s.taxClass]?.rate || 0) > 0 && (
                    <span className="chip" style={{ marginLeft: 6 }}>{TAXCLASS[s.taxClass].tag}</span>
                  )}
                </div>
              </button>
            ))}
            {shown.length === 0 && <div className="empty" style={{ gridColumn: "1/-1" }}>No services match.</div>}
          </div>
        </div>
      </div>

      <div className="card pad" style={{ position: "sticky", top: 76 }}>
        <h3>Bill</h3>
        {lines.length === 0 ? (
          <div className="empty"><div className="big">🧾</div>Tap services on the left to add them.</div>
        ) : (
          <table className="lines" style={{ marginBottom: 10 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Rate</th>
                <th className="num">₹</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td>{l.name}</td>
                  <td>
                    <input className="qtyw" type="number" min={1} step={1} value={l.qty} onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                  </td>
                  <td>
                    <input style={{ width: 90 }} type="number" min={0} value={l.rate} onChange={(e) => setLine(l.key, { rate: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="num">{money(l.qty * l.rate)}</td>
                  <td>
                    <button type="button" className="btn sm danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="f" style={{ marginTop: 12 }}>
          <label>Discount</label>
          <div className="row">
            <div className="disctoggle">
              <button type="button" className={"pill" + (discountType === "NONE" ? " on" : "")} onClick={() => { setDiscountType("NONE"); setDiscountValue(""); }}>None</button>
              <button type="button" className={"pill" + (discountType === "PERCENT" ? " on" : "")} onClick={() => setDiscountType("PERCENT")}>%</button>
              <button type="button" className={"pill" + (discountType === "AMOUNT" ? " on" : "")} onClick={() => setDiscountType("AMOUNT")}>₹</button>
            </div>
            {discountType !== "NONE" && (
              <input
                style={{ width: 110 }}
                type="number"
                min={0}
                max={discountType === "PERCENT" ? 100 : undefined}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "PERCENT" ? "% off" : "₹ off"}
              />
            )}
            {discountType === "PERCENT" && (
              <span className="quickbtns">
                {[5, 10, 15].map((v) => (
                  <button key={v} type="button" className="btn sm ghost" onClick={() => setDiscountValue(String(v))}>{v}%</button>
                ))}
              </span>
            )}
          </div>
          {discountType === "AMOUNT" && Number(discountValue) > totals.subtotal && (
            <div className="hint" style={{ color: "var(--bad)" }}>Discount is more than the subtotal — it will be capped.</div>
          )}
        </div>

        <div className="tot"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
        {totals.discountAmount > 0 && (
          <div className="tot" style={{ color: "var(--bad)" }}>
            <span>Discount {discountType === "PERCENT" ? `(${discountValue}%)` : ""}</span>
            <span>− {money(totals.discountAmount)}</span>
          </div>
        )}
        {totals.taxAmount > 0 && (
          <div className="tot"><span>GST (after discount)</span><span>{money(totals.taxAmount)}</span></div>
        )}
        <div className="tot big"><span>Total</span><span>{money(totals.total)}</span></div>

        <div className="f" style={{ marginTop: 14 }}>
          <label className="inline">
            <input type="checkbox" style={{ width: "auto" }} checked={payFull} onChange={(e) => { setPayFull(e.target.checked); if (e.target.checked) setPayAmount(""); }} />
            Collect full payment now
          </label>
        </div>
        {!payFull && (
          <div className="f">
            <label>Amount received now (₹)</label>
            <input type="number" min={0} max={totals.total} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Leave 0 for pure credit bill" />
          </div>
        )}
        <div className="f">
          <label>Payment mode</label>
          <div className="row">
            {["CASH", "UPI", "CARD", "BANK"].map((m) => (
              <button key={m} type="button" className={"pill" + (payMode === m ? " on" : "")} onClick={() => setPayMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="f">
          <label>Note (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. senior citizen discount" />
        </div>

        {err && <div className="alert e">⚠️ {err}</div>}
        <button className="btn gold lg" style={{ width: "100%" }} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save bill"}
        </button>
      </div>
    </div>
  );
}
