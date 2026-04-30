export async function GET() {
  return Response.json({
    KWIK_BASE_URL: process.env.KWIK_BASE_URL ?? null,
    hasEmail: Boolean(process.env.KWIK_EMAIL),
    hasPassword: Boolean(process.env.KWIK_PASSWORD),
  })
}
