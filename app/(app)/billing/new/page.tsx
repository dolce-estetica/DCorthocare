import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "../../PageHeader";
import NewBillClient from "./NewBillClient";

export const dynamic = "force-dynamic";

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const preselect = typeof sp.patient === "string" ? sp.patient : "";

  const [services, patients, professionals] = await Promise.all([
    prisma.service.findMany({ where: { active: true, price: { gt: 0 } }, orderBy: { code: "asc" } }),
    prisma.patient.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    prisma.user.findMany({
      where: { role: { in: ["DOCTOR", "PHYSIO"] }, active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  const me = professionals.find((p) => p.id === session!.user!.id);

  return (
    <>
      <PageHeader title="New Bill" sub="Registration → doctor / physio → billing" />
      <main id="view">
        <NewBillClient
          services={services.map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            malayalam: s.malayalam,
            category: s.category,
            price: s.price,
            taxClass: s.taxClass,
          }))}
          patients={patients}
          professionals={professionals.map((p) => ({ id: p.id, name: p.name, role: p.role }))}
          defaultProfessionalId={me?.id || professionals[0]?.id || ""}
          preselectPatientId={preselect}
        />
      </main>
    </>
  );
}
