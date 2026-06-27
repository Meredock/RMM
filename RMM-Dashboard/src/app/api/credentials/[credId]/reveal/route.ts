import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { auditCurrentUser } from "@/lib/audit";

// Reveal decrypts and returns a credential's secret. Every reveal is audited —
// this is the only path that exposes a stored secret.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ credId: string }> }
) {
  const { credId } = await params;
  const cred = await prisma.credential.findUnique({
    where: { id: credId },
    select: { title: true, secretEnc: true, company: { select: { name: true } } },
  });
  if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let secret = "";
  try {
    secret = decryptSecret(cred.secretEnc);
  } catch {
    return NextResponse.json({ error: "Could not decrypt (key mismatch?)" }, { status: 500 });
  }

  await auditCurrentUser("vault.credential.reveal", `${cred.company.name} / ${cred.title}`, null);
  return NextResponse.json({ secret });
}
