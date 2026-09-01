/* Seed: users, service catalogue, patients, demo bills (idempotent). */
import { PrismaClient, DiscountType, PayMode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SERVICES: [string, string, string, string, number, string][] = [
  ["C01", "Orthopaedic Consultation — New", "ഓർത്തോ കൺസൾട്ടേഷൻ (പുതിയത്)", "Consultation", 500, "exempt"],
  ["C02", "Review Consultation", "റിവ്യൂ കൺസൾട്ടേഷൻ", "Consultation", 300, "exempt"],
  ["C03", "Sports Injury Assessment", "സ്പോർട്സ് പരിക്ക് വിലയിരുത്തൽ", "Consultation", 800, "exempt"],
  ["C04", "Second Opinion & Treatment Planning", "സെക്കൻഡ് ഒപ്പീനിയൻ", "Consultation", 1000, "exempt"],
  ["C05", "Fracture & Trauma Evaluation", "ഒടിവ് / പരിക്ക് പരിശോധന", "Consultation", 800, "exempt"],
  ["C06", "Musculoskeletal Ultrasound Assessment", "മസ്കുലോസ്കെലിറ്റൽ അൾട്രാസൗണ്ട്", "Consultation", 1200, "exempt"],
  ["I01", "Knee Injection (intra-articular)", "കാൽമുട്ട് ഇഞ്ചക്ഷൻ", "Injections", 2500, "exempt"],
  ["I02", "Shoulder Injection", "തോൾ ഇഞ്ചക്ഷൻ", "Injections", 2500, "exempt"],
  ["I03", "Hip / Other Joint Injection", "ഇടുപ്പ് / മറ്റ് സന്ധി ഇഞ്ചക്ഷൻ", "Injections", 3000, "exempt"],
  ["I04", "Ultrasound-Guided Injection", "അൾട്രാസൗണ്ട് ഗൈഡഡ് ഇഞ്ചക്ഷൻ", "Injections", 3500, "exempt"],
  ["I05", "Joint Aspiration", "സന്ധിയിൽ നിന്ന് ദ്രാവകം നീക്കൽ", "Injections", 2000, "exempt"],
  ["I06", "Bursa / Tendon Sheath Injection", "ബർസ / ടെൻഡൺ ഇഞ്ചക്ഷൻ", "Injections", 2000, "exempt"],
  ["I07", "Trigger Point Injection", "ട്രിഗർ പോയിന്റ് ഇഞ്ചക്ഷൻ", "Injections", 1500, "exempt"],
  ["I08", "Soft Tissue Injection", "സോഫ്റ്റ് ടിഷ്യൂ ഇഞ്ചക്ഷൻ", "Injections", 1800, "exempt"],
  ["R01", "PRP Therapy — single joint", "പി.ആർ.പി തെറാപ്പി", "Regenerative", 7000, "exempt"],
  ["R02", "GFC Therapy", "ജി.എഫ്.സി തെറാപ്പി", "Regenerative", 9000, "exempt"],
  ["R03", "PDRN-Based Therapy", "പി.ഡി.ആർ.എൻ തെറാപ്പി", "Regenerative", 8000, "exempt"],
  ["R04", "Hyaluronic Acid (HA) Injection", "ഹയലുറോണിക് ആസിഡ് ഇഞ്ചക്ഷൻ", "Regenerative", 6000, "exempt"],
  ["R05", "Advanced Biologic Therapy", "അഡ്വാൻസ്ഡ് ബയോളജിക് തെറാപ്പി", "Regenerative", 12000, "exempt"],
  ["R06", "Cartilage & Joint Preservation Procedure", "കാർട്ടിലേജ് സംരക്ഷണ ചികിത്സ", "Regenerative", 15000, "exempt"],
  ["R07", "PRP — Aesthetic / Cosmetic (hair, skin)", "പി.ആർ.പി (സൗന്ദര്യ ചികിത്സ)", "Regenerative", 6000, "gst18"],
  ["M01", "Wound Care & Dressing", "മുറിവ് ഡ്രസ്സിംഗ്", "Minor Procedures", 400, "exempt"],
  ["M02", "Suture / Staple Removal", "തുന്നൽ നീക്കം ചെയ്യൽ", "Minor Procedures", 300, "exempt"],
  ["M03", "Nail / Soft-Tissue Procedure", "നഖം / സോഫ്റ്റ് ടിഷ്യൂ ചികിത്സ", "Minor Procedures", 2500, "exempt"],
  ["M04", "Minor Orthopaedic Procedure", "ചെറിയ ഓർത്തോ ശസ്ത്രക്രിയ", "Minor Procedures", 3500, "exempt"],
  ["P01", "Plaster — Below Knee", "പ്ലാസ്റ്റർ (കാൽമുട്ടിന് താഴെ)", "Plaster & Casting", 1500, "exempt"],
  ["P02", "Plaster — Above Knee", "പ്ലാസ്റ്റർ (കാൽമുട്ടിന് മുകളിൽ)", "Plaster & Casting", 2500, "exempt"],
  ["P03", "Plaster — Below Elbow", "പ്ലാസ്റ്റർ (കൈമുട്ടിന് താഴെ)", "Plaster & Casting", 1200, "exempt"],
  ["P04", "Plaster — Above Elbow", "പ്ലാസ്റ്റർ (കൈമുട്ടിന് മുകളിൽ)", "Plaster & Casting", 2000, "exempt"],
  ["P05", "Splint Application", "സ്പ്ലിന്റ്", "Plaster & Casting", 1000, "exempt"],
  ["P06", "Cast Care / Removal", "കാസ്റ്റ് നീക്കം ചെയ്യൽ", "Plaster & Casting", 500, "exempt"],
  ["F01", "Physiotherapy Session", "ഫിസിയോതെറാപ്പി സെഷൻ", "Physio & Rehab", 500, "exempt"],
  ["F02", "Physio Package — 10 sessions", "ഫിസിയോ പാക്കേജ് (10 സെഷൻ)", "Physio & Rehab", 4500, "exempt"],
  ["F03", "Sports Injury Rehabilitation", "സ്പോർട്സ് പരിക്ക് പുനരധിവാസം", "Physio & Rehab", 700, "exempt"],
  ["F04", "Post-operative Rehabilitation", "ശസ്ത്രക്രിയാനന്തര പുനരധിവാസം", "Physio & Rehab", 700, "exempt"],
  ["F05", "Knee Rehabilitation", "കാൽമുട്ട് പുനരധിവാസം", "Physio & Rehab", 700, "exempt"],
  ["F06", "Shoulder Rehabilitation", "തോൾ പുനരധിവാസം", "Physio & Rehab", 700, "exempt"],
  ["F07", "ACL Rehabilitation", "എ.സി.എൽ പുനരധിവാസം", "Physio & Rehab", 800, "exempt"],
  ["F08", "Rotator Cuff Rehabilitation", "റൊട്ടേറ്റർ കഫ് പുനരധിവാസം", "Physio & Rehab", 800, "exempt"],
  ["F09", "Return-to-Sport Assessment", "റിട്ടേൺ ടു സ്പോർട്ട് വിലയിരുത്തൽ", "Physio & Rehab", 1500, "exempt"],
  ["S01", "Arthroscopic Knee Surgery (estimate)", "ആർത്രോസ്കോപ്പിക് കാൽമുട്ട് ശസ്ത്രക്രിയ", "Surgical", 0, "exempt"],
  ["S02", "Arthroscopic Shoulder Surgery (estimate)", "ആർത്രോസ്കോപ്പിക് തോൾ ശസ്ത്രക്രിയ", "Surgical", 0, "exempt"],
  ["S03", "ACL Reconstruction (estimate)", "എ.സി.എൽ പുനർനിർമ്മാണം", "Surgical", 0, "exempt"],
  ["S04", "Meniscal Surgery (estimate)", "മെനിസ്കൽ ശസ്ത്രക്രിയ", "Surgical", 0, "exempt"],
  ["S05", "Rotator Cuff Repair (estimate)", "റൊട്ടേറ്റർ കഫ് റിപ്പയർ", "Surgical", 0, "exempt"],
  ["S06", "Shoulder Stabilisation (estimate)", "ഷോൾഡർ സ്റ്റെബിലൈസേഷൻ", "Surgical", 0, "exempt"],
  ["S07", "Joint Replacement (estimate)", "സന്ധി മാറ്റിവയ്ക്കൽ", "Surgical", 0, "exempt"],
  ["S08", "Complex Fracture & Trauma Surgery (estimate)", "സങ്കീർണ ഒടിവ് ശസ്ത്രക്രിയ", "Surgical", 0, "exempt"],
  ["S09", "Pelvic & Acetabular Trauma Surgery (estimate)", "പെൽവിക് ട്രോമ ശസ്ത്രക്രിയ", "Surgical", 0, "exempt"],
  ["G01", "Knee Brace / Support (sale)", "കാൽമുട്ട് ബ്രേസ് (വിൽപ്പന)", "Goods & Appliances", 1200, "gst5"],
  ["G02", "Lumbar / Cervical Support (sale)", "ലംബാർ / സെർവിക്കൽ സപ്പോർട്ട്", "Goods & Appliances", 900, "gst5"],
  ["G03", "Walker / Crutches / Stick (sale)", "വാക്കർ / ഊന്നുവടി", "Goods & Appliances", 1500, "gst5"],
  ["G04", "Medicines / Consumables (sale)", "മരുന്ന് / ഉപഭോഗ വസ്തുക്കൾ", "Goods & Appliances", 0, "gst5"],
];

const R = (n: number) => Math.round(n * 100) / 100;
let rngState = 42;
const rnd = () => ((rngState = (rngState * 1103515245 + 12345) % 2147483648) / 2147483648);

function computeTotals(
  items: { qty: number; rate: number; taxClass: string }[],
  discountType: DiscountType,
  discountValue: number
) {
  const subtotal = R(items.reduce((s, i) => s + i.qty * i.rate, 0));
  let discountAmount = 0;
  if (discountType === "PERCENT") discountAmount = (subtotal * Math.min(100, Math.max(0, discountValue))) / 100;
  else if (discountType === "AMOUNT") discountAmount = Math.min(subtotal, Math.max(0, discountValue));
  discountAmount = R(discountAmount);
  const ratio = subtotal > 0 ? discountAmount / subtotal : 0;
  const taxRates: Record<string, number> = { exempt: 0, gst5: 5, gst12: 12, gst18: 18 };
  const taxAmount = R(
    items.reduce((s, i) => s + i.qty * i.rate * (1 - ratio) * (taxRates[i.taxClass] || 0) / 100, 0)
  );
  return { subtotal, discountAmount, taxAmount, total: R(subtotal - discountAmount + taxAmount) };
}

async function main() {
  const pass = (p: string) => bcrypt.hashSync(p, 10);

  const users = [
    { username: "DCORTHO", name: "Dr. Dhanil Charly (Admin)", role: "ADMIN" as const, password: "DC@1234" },
    { username: "DRDHANIL", name: "Dr. Dhanil Charly", role: "DOCTOR" as const, password: "Dhanil@123" },
    { username: "PHYSIOANI", name: "Anitha Thomas", role: "PHYSIO" as const, password: "Anitha@123" },
    { username: "RECEPTION", name: "Front Desk", role: "STAFF" as const, password: "Front@123" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, role: u.role },
      create: { username: u.username, name: u.name, role: u.role, passwordHash: pass(u.password) },
    });
  }

  for (const [code, name, mal, cat, price, tax] of SERVICES) {
    await prisma.service.upsert({
      where: { code },
      update: { name, malayalam: mal, category: cat, price, taxClass: tax },
      create: { code, name, malayalam: mal, category: cat, price, taxClass: tax },
    });
  }

  const patientSeed: [string, string, number, string, string][] = [
    ["Ramesh Kumar", "9847012345", 54, "M", "Thrissur"],
    ["Suseela Menon", "9846056781", 47, "F", "Ernakulam"],
    ["Ajith Varma", "9946123450", 32, "M", "Palakkad"],
    ["Fathima Beevi", "9447023456", 61, "F", "Malappuram"],
    ["Thomas Mathew", "9495334567", 39, "M", "Thrissur"],
    ["Deepa Nair", "9745123489", 28, "F", "Kunnamkulam"],
    ["Sanoj Ali", "9048456712", 45, "M", "Guruvayur"],
    ["Lakshmi Amma", "9400345612", 68, "F", "Thrissur"],
  ];
  const patients: { id: string }[] = [];
  for (const [name, phone, age, gender, address] of patientSeed) {
    const p = await prisma.patient.upsert({
      where: { id: "seed_" + phone },
      update: {},
      create: { id: "seed_" + phone, name, phone, age, gender, address },
    });
    patients.push(p);
  }

  const billCount = await prisma.bill.count();
  if (billCount > 0) {
    console.log(`Seed: ${billCount} bills already exist — skipping demo bills.`);
    return;
  }

  const pros = await prisma.user.findMany({ where: { role: { in: ["DOCTOR", "PHYSIO"] }, active: true } });
  const services = (await prisma.service.findMany()).filter((s) => s.price > 0);
  const monthSeq: Record<string, number> = {};

  const dayKeyIST = (d: Date) =>
    d.toLocaleString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

  for (let day = 34; day >= 0; day--) {
    const nBills = 1 + Math.floor(rnd() * 3); // 1–3 bills per day
    for (let b = 0; b < nBills; b++) {
      const when = new Date(Date.now() - day * 86400000 + (9 + Math.floor(rnd() * 9)) * 3600000);
      const nItems = 1 + Math.floor(rnd() * 2.4);
      const chosen: typeof services = [];
      for (let i = 0; i < nItems; i++) {
        const s = services[Math.floor(rnd() * services.length)];
        if (!chosen.find((c) => c.id === s.id)) chosen.push(s);
      }
      const pro = pros[Math.floor(rnd() * pros.length)];
      // Physios mostly bill physio services, doctors the rest — keep attribution realistic
      const proServices = chosen.filter((s) =>
        pro.role === "PHYSIO" ? s.category === "Physio & Rehab" : s.category !== "Physio & Rehab"
      );
      const items = (proServices.length ? proServices : chosen).map((s) => ({
        serviceId: s.id,
        name: s.name,
        qty: rnd() < 0.2 ? 2 : 1,
        rate: s.price,
        taxClass: s.taxClass,
      }));
      if (!items.length) continue;

      let discountType: DiscountType = "NONE";
      let discountValue = 0;
      const roll = rnd();
      if (roll < 0.22) {
        discountType = "PERCENT";
        discountValue = [5, 10, 15][Math.floor(rnd() * 3)];
      } else if (roll < 0.34) {
        discountType = "AMOUNT";
        discountValue = [100, 200, 500][Math.floor(rnd() * 3)];
      }
      const t = computeTotals(items, discountType, discountValue);

      const mk = dayKeyIST(when).slice(0, 7);
      monthSeq[mk] = (monthSeq[mk] || 0) + 1;
      const billNo = `DCOC-${mk.replace("-", "")}-${String(monthSeq[mk]).padStart(3, "0")}`;

      const payRoll = rnd();
      const modes: PayMode[] = ["CASH", "UPI", "CARD", "BANK"];
      const bill = await prisma.bill.create({
        data: {
          billNo,
          date: when,
          patientId: patients[Math.floor(rnd() * patients.length)].id,
          professionalId: pro.id,
          subtotal: t.subtotal,
          discountType,
          discountValue,
          discountAmount: t.discountAmount,
          taxAmount: t.taxAmount,
          total: t.total,
          items: {
            create: items.map((i) => ({
              serviceId: i.serviceId,
              name: i.name,
              qty: i.qty,
              rate: i.rate,
              amount: R(i.qty * i.rate),
              taxClass: i.taxClass,
            })),
          },
        },
      });
      if (payRoll < 0.8) {
        await prisma.payment.create({
          data: { billId: bill.id, amount: t.total, mode: modes[Math.floor(rnd() * modes.length)], date: when },
        });
      } else if (payRoll < 0.93) {
        await prisma.payment.create({
          data: { billId: bill.id, amount: R(t.total * 0.5), mode: modes[Math.floor(rnd() * modes.length)], date: when },
        });
      }
    }
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
