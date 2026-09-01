/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      // Serve the original single-page app (public/index.html) at the root,
      // exactly as shipped — identical markup, styles, icons and behaviour.
      beforeFiles: [
        { source: '/', destination: '/index.html' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
