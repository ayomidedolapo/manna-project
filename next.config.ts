// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // ✅ Prevent Next.js from bundling PDFKit on the server
  // This fixes: ENOENT ... pdfkit/js/data/Helvetica.afm
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;