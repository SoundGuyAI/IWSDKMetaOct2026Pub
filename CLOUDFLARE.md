# Deploying Wall Tones 2 to Cloudflare Workers

The repo carries a `wrangler.jsonc`, so Cloudflare's Workers git integration
can build and deploy the game as a static-assets-only Worker. No Worker
script and no secrets are involved: `npm run build` emits `dist/`, and the
Worker serves those files. Vite's base is `./`, so the same bundle works at
the `workers.dev` root and under the GitHub Pages project path.

## Setup screen values

On the Cloudflare "Set up your application" screen for
`SoundGuyAI/IWSDKMetaOct2026Pub`:

| Field | Value |
| --- | --- |
| Project name | `iwsdkmetaoct2026pub` (must match `name` in `wrangler.jsonc`) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |

These are the screen's defaults; nothing needs changing there. Pressing
Deploy builds the default branch and serves it at
`https://iwsdkmetaoct2026pub.<your-subdomain>.workers.dev/`.

## Notes

- Node: the repo pins Node 22.12.0 in `.nvmrc` and requires Node >= 20.19
  (`engines` in `package.json`). If a Cloudflare build fails on the Node
  version, set `NODE_VERSION=22.12.0` in the Worker's build variables.
- Local deploy: `npm run deploy:cloudflare` (wraps `npx wrangler deploy`)
  after `npm run build`, once you have run `npx wrangler login`.
- The GitHub Pages deployment at
  https://soundguyai.github.io/IWSDKMetaOct2026Pub/ is unchanged; Cloudflare
  is an additional target.
- The build version/hash line in Settings keeps working: on Cloudflare builds
  the commit hash comes from the git checkout.

## Production release - 2026-11-11

- Release source: accepted main `b2fa4600da7482496ba3b5d879c0d406e001ae09`.
- Oded tested this build and approved the first production build.
- This release-note-only commit triggers the configured `CloudFlareProd`
  build without changing app code, assets, dependencies or build settings.
- Future production promotions require a separate approval.
