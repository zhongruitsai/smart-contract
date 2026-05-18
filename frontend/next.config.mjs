/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  images: { unoptimized: true },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding", "@react-native-async-storage/async-storage");
    return config;
  },
};

export default nextConfig;
