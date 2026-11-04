export default async function run({ page }) {
  await page.evaluate(() => {
    sessionStorage.setItem('iwsdk-experience-mode', 'walltones');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
}
