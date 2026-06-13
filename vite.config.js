import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works under a GitHub Pages subpath
  base: './',
  server: {
    host: '0.0.0.0', // bind all interfaces (LAN + Tailscale) for phone testing
    // allow access via Tailscale MagicDNS (*.ts.net), not just raw IPs
    allowedHosts: ['.ts.net'],
  },
});
