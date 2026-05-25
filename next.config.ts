import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Needed for Swagger generation in production on Vercel.
  // With Turbopack, route code is bundled into chunks and JSDoc comments are
  // not available under `.next/server/app/api/**`, so next-swagger-doc must
  // scan the source files instead. This ensures the source API routes are
  // included in the serverless function trace for `/api/docs`.
  outputFileTracingIncludes: {
    "/api/docs": ["app/api/**/*.ts", "lib/swagger.ts"],
  },
};

export default nextConfig;
