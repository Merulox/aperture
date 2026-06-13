import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://aperture.merulox.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  security: { checkOrigin: false },
});
