import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function main() {
  await prisma.discount.create({
    data: {
      title: "Test 10% Off",
      type: "PERCENTAGE",
      percentageOff: 10,
      appliesToAll: true,
      isActive: true,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  })
  console.log("✅ Seeded discount")
}

main().finally(async () => prisma.$disconnect())
