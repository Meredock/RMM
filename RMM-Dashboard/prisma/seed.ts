import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Default alert rules
  const existingRules = await prisma.alertRule.count();
  if (existingRules === 0) {
    await prisma.alertRule.createMany({
      data: [
        { type: "HIGH_CPU", threshold: 90, severity: "CRITICAL" },
        { type: "HIGH_CPU", threshold: 80, severity: "WARNING" },
        { type: "HIGH_RAM", threshold: 90, severity: "CRITICAL" },
        { type: "HIGH_RAM", threshold: 80, severity: "WARNING" },
        { type: "HIGH_DISK", threshold: 90, severity: "CRITICAL" },
        { type: "HIGH_DISK", threshold: 80, severity: "WARNING" },
      ],
    });
    console.log("Created default alert rules");
  } else {
    console.log("Alert rules already exist, skipping seed");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
