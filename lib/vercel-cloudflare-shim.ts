// Vercel build-time compatibility for routes that normally run on Cloudflare Workers.
// Cloudflare D1 remains unavailable until a database binding is configured.
export const env: any = {
  TUESTE_ADMIN_EMAILS: process.env.TUESTE_ADMIN_EMAILS,
};
