/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma's query engine must stay external to the server bundle so the
  // native binary is traced and included in serverless functions.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
