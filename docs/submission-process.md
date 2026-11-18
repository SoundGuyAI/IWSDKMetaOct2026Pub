# Meta Horizon Store PWA submission process

Research checkpoint: 2026-11-18. Preparation only, not a submitted or approved app.
Tracking: [owner backlog item 125](../WALL_TONES_TODO.md), in progress.

## Recommended route

Keep the existing IWSDK game and HTTPS deployment. Package an immersive WebXR
PWA (Progressive Web App) for installation from Meta Horizon Store. This wraps
the hosted game in a signed Android package, rather than converting the game
to Unity or shipping all web content inside the APK. WebXR means the browser's
immersive VR/MR session API.

This can be developed collaboratively in normal branches and PRs. Cursor can
work on a bounded implementation branch or help with local Android tooling;
it is not required for the documented packaging route. Physical Quest tests
and owner-controlled publishing/financial decisions remain separate gates.
A native-conversion experiment is a separate workstream, not part of this plan.

The IWSDK build/deploy stage already exists. Do not replace the hosting setup
or turn main merges into production deployments for this work.

## Source privacy is a separate decision

The reviewed Meta requirements call for a reachable HTTPS game and manifest,
a signed package, and origin verification. They do not require a private source
repository. Documentation and implementation groundwork can start now.

Making the source private does not make deployed JavaScript private: a PWA
still downloads web content. Avoid shipping secrets, server credentials or
signing keys in either source control or the browser bundle. Choose source
visibility for source protection and workflow reasons, not as a packaging gate.
Before changing visibility, separately check hosting, GitHub Pages availability,
preview exposure, CI costs and access retained by the Cloudflare integration.
No visibility change is part of this PR.

## Audited starting point and gaps

Source audit: main `baa3e8b` (2026-11-18). Recheck current main before implementation;
other PRs and production releases continue independently.

| Area | Observed state | Remaining work |
| --- | --- | --- |
| Web build and hosting | Vite/IWSDK app with static Cloudflare Workers assets | Reuse, then verify the chosen release origin and exact build |
| Web manifest | No web app manifest or HTML manifest link in the audited source | Add a manifest with stable start URL/scope and app metadata |
| App icons | Existing SVG favicon; no PWA launcher icon set identified | Prepare and inspect appropriate PNG launcher/splash icons |
| Live production checks | Production root loads; no manifest link. `/manifest.webmanifest` and `/.well-known/assetlinks.json` returned 404 | Deploy and verify real JSON at these endpoints in an approved release |
| Immersive startup | Current hub offers explicit Enter XR; `src/app-mode.ts` owns that route | Add and test a packaged-only direct immersive launch path without breaking website/desktop/phone flow |
| Package | No generated Bubblewrap project found | Choose app/package identity and signing approach; generate a separate packaging project |
| Billing | No Digital Goods/Payment Request integration found | Implement only after product and account decisions below |
| Economy | `src/wall-tones/economy.ts` persists progress in localStorage | Keep earned Bars separate from real-money purchase authority; design verified entitlements |
| Offline support | No service-worker registration found | Decide network failure/cache/update behavior; reviewed Meta packaging pages do not make a service worker an explicit prerequisite |

Live check origin: https://iwsdkmetaoct2026pub.cloudflareazure.workers.dev/
This audit proves website rendering and endpoint state, not headset or Store readiness.

## Billing: what is supported and what is not settled

Meta's current WebXR PWA IAP guide supports in-app purchases through the
Digital Goods API and Payment Request API using Meta Horizon billing. This is
a web integration, not a drop-in native SDK integration.

- IAP is supported for immersive WebXR PWAs, not ordinary desktop/mobile
  website sessions or 2D PWAs under the current documented route.
- Subscriptions are currently unsupported in the WebXR PWA IAP guide.
- Normal billing testing uses a Store-installed package, including ALPHA/BETA.
  The IAP guide also documents a sideload debugging flag; do not rely on a
  desktop browser test or an ordinary sideload alone as purchase acceptance.
- Enable Horizon Billing during Meta Quest Bubblewrap initialization and use
  the correct Meta Horizon Application ID.
- An administrator must complete Data Use Checkup, including the IAP/DLC
  feature even for test purchases. User ID/profile access has its own grants.
- Add-on SKUs and localized product details belong in Developer Dashboard.
  Display prices returned by the service, not invented or fixed client prices.
- Paid add-ons need team payment information and a linked payee. Banking/tax
  setup, legal terms, prices and product choices require owner decisions.
  Never put private financial details in this repository.

### Paid download and eligibility: confirm before committing

The older official monetization page dated 2025-02-04 says PWA base apps are
free-to-play only. The newer 2026-07-22 overview documents IAP but does not
repeat or explicitly remove that restriction. A general submission page offers
free/paid pricing for apps, but does not settle PWA-specific eligibility.
Therefore do not promise a paid PWA download or set a base price from this
research. Conservative planning route: a free immersive PWA with optional
owner-approved IAP, pending confirmation of current Store policy.

Likewise, the older PWA getting-started page says developers must already have
an app listed on the Store. The newer preparation/packaging pages do not repeat
that condition. Verify current organization/app eligibility in the dashboard or
with Meta support before submission. No account eligibility was checked here.
Do not assume a previous title authorizes reusing its app ID, package or key.

External web checkout for digital game goods has not been established as an
allowed alternative for this Store route. Do not add Stripe, payment links or
other checkout as a workaround without a separate policy review.

### Suggested billing architecture, not implementation approval

Start by choosing what is sold: a durable unlock versus consumable currency.
A durable unlock is a smaller first integration than selling Bars, because
consumables require consumption and duplicate-delivery/recovery handling.
The owner chooses the model, content, pricing and whether any earned economy
changes. Nothing here changes existing Bars, unlocks or gameplay.

Use a small capability-aware billing adapter: query product details, start the
Meta purchase dialog from user action, record its token, complete the response,
verify entitlement and grant once. Handle cancel, pending/error, unavailable
service and restore/reinstall. Do not grant paid content merely because a
localStorage flag or client callback claims success.

Prefer a trusted backend for verification and any consumable ledger. Meta's
server APIs support ownership checks and consumption; their guide requires an
uploaded APK before monetization APIs work. The current deployment is static
assets only, so a secure backend would be a new design/cost/privacy decision,
not an assumed capability of the existing app. Never embed the app secret in
Vite variables, JavaScript, a manifest or public CI logs. Follow the documented
acknowledgment/consumption lifecycle for the selected add-on type.

If choosing Mixed Ages, the WebXR PWA IAP guide requires calling the age-category
API on every launch. Decide audience and data use before building that flow.

## Phased checklist

### 1. Decisions and hosted app readiness

- [ ] Confirm immersive PWA route, app identity/new listing versus an existing listing, and current eligibility.
- [ ] Confirm a stable production HTTPS origin. Do not package a temporary PR preview.
- [ ] Confirm billing product model and current paid-download policy. No price is selected.
- [ ] Add manifest, HTML link and inspected PNG icons; verify JSON, scope, URLs and asset loading on the chosen origin.
- [ ] Add packaged-only immersive launch after initialization. Preserve browser user-gesture rules and existing flat-screen entry; test audio, scene setup and session exit/resume on Quest.
- [ ] Define offline/network-loss/update behavior without stale caches hiding a release.

### 2. Packaging, signing and origin verification

- [ ] With owner approval, create/select the correct dashboard app and record app/package identity outside this generic process doc.
- [ ] Use the published `@meta-quest/bubblewrap-cli`; the reviewed packaging guide verifies version 1.24.1 and Node >=18. Recheck versions before execution and respect this repo's own Node requirement.
- [ ] Initialize against the real HTTPS manifest using the Meta Quest option. Select `immersive` app mode and enable Horizon Billing only when IAP is intended.
- [ ] Choose a permanent unique Android package identifier. If updating an existing listing, preserve the required identifier and signing certificate.
- [ ] Keep the release keystore, alias and passwords in secure storage with a recovery plan. Add appropriate ignore rules before generating packaging output; existing ignore rules do not cover all signing files.
- [ ] Generate Digital Asset Links with the real package name and signing certificate SHA-256 fingerprint. Serve valid JSON at `/.well-known/assetlinks.json` on each trusted origin. An immersive package does not launch when this verification fails.
- [ ] Review generated Gradle settings against current Meta requirements. The 2026-10-22 guide specifies target SDK 32 and replacing obsolete `jcenter()` with `mavenCentral()` if present; recheck rather than applying to unrelated native work.
- [ ] Build a signed APK, inspect package/mode/certificate identity and record its version and tested hosted commit. Do not commit keystores, passwords, secrets or generated release binaries.

### 3. Billing and physical Quest validation

- [ ] Owner/admin confirms DUC, IAP feature, appropriate data grants, audience, financial eligibility/payee and add-on configuration.
- [ ] Implement billing adapter and verified entitlement flow with cancel/error/restore/idempotence tests. Keep normal website mode useful when billing is unavailable.
- [ ] Install and test on a real Quest: direct immersive launch, origin verification, hands/controllers, room setup, audio, suspend/resume, exit/relaunch and network failures. Desktop emulation is not this gate.
- [ ] After separate upload approval, test via ALPHA with test users and configured add-ons. Complete purchase/cancel/restore tests without unintended charges; check duplicate grants, refund/revocation behavior and consumable recovery as applicable.
- [ ] Review current immersive VRCs, privacy/data declarations, age/content rating, accessibility, listing assets, rights and supported devices.

### 4. Owner-approved submission and release

- [ ] Owner reviews listing copy/assets, audience, privacy declarations, support details, monetization and release plan.
- [ ] Upload the approved signed package to the chosen release channel and submit only after an explicit publishing decision. Uploading/testing and public release are different steps.
- [ ] Track review feedback and retest changes. Meta's submission guide recommends allowing at least two weeks before a desired launch, not a guaranteed review SLA.
- [ ] Keep the hosted origin available. Record approved package, hosted build and certificate fingerprint. Web updates can affect the installed PWA; maintain controlled production promotion and review applicable update requirements.

## PR boundaries and collaboration

This PR is documentation only. Later runtime implementation should be a separate
focused PR, with latest-main reconciliation, relevant tests and actual headset
acceptance recorded. Packaging/billing account steps remain explicit gates.
Do not merge, promote production, change visibility, create financial accounts
or submit to Meta on the strength of this checklist.

A Cursor handoff can point to this file, the current repo rules and one agreed
implementation slice. Avoid two tools editing the same branch at once. Keep
native conversion research separate from this PWA packaging route.

## Sources checked

Owner-supplied starting points:

1. [3D web](https://developers.meta.com/vr/llmstxt/documentation/web/3d-web.md)
2. [IWSDK build/deploy](https://developers.meta.com/vr/documentation/iwsdk/guides/08-build-deploy/)
3. [PWA overview](https://developers.meta.com/vr/documentation/web/pwa-overview/)
4. [PWA packaging](https://developers.meta.com/vr/documentation/web/pwa-packaging/)

Additional official references:

- [Hosted manifest preparation](https://developers.meta.com/vr/documentation/web/pwa-overview-gs/)
- [Immersive startup](https://developers.meta.com/vr/documentation/web/pwa-webxr/)
- [Current WebXR PWA monetization overview](https://developers.meta.com/vr/documentation/web/ps-monetization-overview/)
- [WebXR PWA IAP, DUC and age requirements](https://developers.meta.com/vr/documentation/web/ps-iap/)
- [Add-ons setup and payment/payee prerequisites](https://developers.meta.com/vr/resources/add-ons-setup/)
- [Server APIs and uploaded-APK prerequisite](https://developers.meta.com/vr/documentation/web/ps-iap-s2s/)
- [Add-on testing](https://developers.meta.com/vr/documentation/web/ps-iap-test/)
- [Financial account prerequisites](https://developers.meta.com/vr/resources/publish-account-management-bank-tax/)
- [Submission checklist](https://latest.developers.meta.com/horizon/resources/publish-submit/)
- [Older PWA pricing restriction, not silently treated as current confirmation](https://latest.developers.meta.com/horizon/documentation/web/ps-monetization-overview/)
- [Older existing-listed-app condition, requires current confirmation](https://developers.meta.com/vr/documentation/web/pwa-gs/)
- [GitHub visibility effects](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [Cloudflare GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
