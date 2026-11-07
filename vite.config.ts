/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * THIRD_PARTY_NOTICES file in the root directory of this source tree.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

/**
 * Build identity shown in Settings so a tester can confirm which build is on
 * the headset. PR previews check out the merge ref, so prefer the PR head SHA
 * (GITHUB_HEAD_SHA) over the merge SHA (GITHUB_SHA); local builds fall back to
 * git, then 'dev'.
 */
const commitHash =
  (process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || '').slice(0, 7) ||
  (() => {
    try {
      return execSync('git rev-parse --short=7 HEAD', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      return 'dev';
    }
  })();

/**
 * When the app is opened through a public tunnel (*.trycloudflare.com), Vite's
 * HMR client may fall back to a WebSocket on localhost:8081. Chrome/Edge then
 * prompt: "Access other apps and services on this device" (loopback permission).
 * That is hot-reload plumbing, not Wall Tones gameplay code.
 *
 * Set PUBLIC_TUNNEL_HOST to the tunnel hostname (no scheme) so HMR stays on the
 * public host, or IWSDK_DISABLE_HMR=1 to turn HMR off for remote headset tests.
 */
const publicTunnelHost = process.env.PUBLIC_TUNNEL_HOST?.replace(
  /^https?:\/\//,
  '',
).replace(/\/$/, '');
const disableHmr = process.env.IWSDK_DISABLE_HMR === '1';

export default defineConfig({
  plugins: [iwsdkDev()],
  define: {
    __WALL_TONES_VERSION__: JSON.stringify(appVersion),
    __WALL_TONES_COMMIT__: JSON.stringify(commitHash),
  },
  server: {
    host: '0.0.0.0',
    port: 8081,
    open: false,
    // Allow Cloudflare quick tunnels and LAN hostnames without blocking the page.
    allowedHosts: ['.trycloudflare.com', 'localhost', '.local'],
    hmr: disableHmr
      ? false
      : publicTunnelHost
        ? {
            protocol: 'wss',
            host: publicTunnelHost,
            clientPort: 443,
          }
        : undefined,
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
