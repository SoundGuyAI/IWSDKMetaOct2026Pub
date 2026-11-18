export default async function run({ page }) {
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const scripts = [...document.scripts].map((s) => s.src).filter(Boolean).slice(0, 8);
    return {
      href: location.href,
      hasDebug: typeof window.__riftLabDebug !== 'undefined',
      hasBuild: typeof window.__wallTonesBuildInfo !== 'undefined',
      canvas: !!document.querySelector('canvas'),
      scripts,
      errs: (window.__probeErrs ??= []),
    };
  });
}
