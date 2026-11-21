import { expect, test } from '@playwright/test';

/**
 * Shared Lab menu foundation. Flat-mode e2e with real canvas clicks: the Lab
 * entry is the third button in the horizontal main-menu row (1280x800 viewport), the Lab menu lists
 * the capability demos, and Back returns to the main menu.
 */
const mode = (page: import('@playwright/test').Page) =>
  page.evaluate(() => sessionStorage.getItem('iwsdk-experience-mode'));

test('Lab entry opens the Lab menu and Back returns to the main menu', async ({ page }) => {
  await page.goto('/');
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.mouse.click(744, 482);
  await expect.poll(() => mode(page)).toBe('lab');
  expect(await page.title()).toBe('Wall Tones 2: Lab');
  // Let the Lab menu take the flat layout and render before clicking Back
  // (bottom row; sits under the connected Rift Sealing Lab row).
  await page.waitForTimeout(2000);
  await page.mouse.move(639, 547);
  await page.mouse.click(639, 547);
  await expect.poll(() => mode(page)).toBe('menu');
});

for (const gender of ['male', 'female'] as const) {
  test(`Lab welcome plays narrator then opposite Cypher cast (${gender} narrator)`, async ({ page }) => {
    await page.addInitScript((voice) => {
      localStorage.setItem('wall-tones-voice-gender', voice);
      (window as any).__labSources = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        (window as any).__labSources.push(this.buffer?.duration ?? 0);
        return start.apply(this, args as Parameters<typeof start>);
      };
    }, gender);
    await page.goto('/');
    await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
    await page.mouse.click(744, 482);
    await expect.poll(() => mode(page)).toBe('lab');
    await expect.poll(() => page.evaluate(() => (window as any).__labSources.length), {timeout: 45000}).toBe(4);
    const durations = await page.evaluate(() => (window as any).__labSources as number[]);
    expect(durations[0]).toBeGreaterThan(6);
    expect(durations[1]).toBeCloseTo(1.5, 1);
    // The generated Cypher voices have different durations, proving cast selection.
    expect(durations[2]).toBeGreaterThan(gender === 'male' ? 8 : 10);
    expect(durations[2]).toBeLessThan(gender === 'male' ? 11 : 13);
    expect(durations[3]).toBeCloseTo(0.22, 1);
    // Back is the bottom row, under the connected Rift Sealing Lab row
    // (same coordinates as the Back test above).
    await page.mouse.click(639, 547);
    await expect.poll(() => mode(page)).toBe('menu');
  });
}

test('leaving Lab during narration cancels the pending Cypher window', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__labSources = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      (window as any).__labSources.push(this.buffer?.duration ?? 0);
      return start.apply(this, args as Parameters<typeof start>);
    };
  });
  await page.goto('/');
  await page.locator('#wt-loading').waitFor({ state: 'detached', timeout: 60000 });
  await page.mouse.click(744, 482);
  await expect.poll(() => page.evaluate(() => (window as any).__labSources.length)).toBe(1);
  await page.waitForTimeout(2000);
  // Back is the bottom row, under the connected Rift Sealing Lab row.
  await page.mouse.move(639, 547);
  await page.mouse.click(639, 547);
  await expect.poll(() => mode(page)).toBe('menu');
  await page.waitForTimeout(11000);
  expect(await page.evaluate(() => (window as any).__labSources.length)).toBe(1);
});


test('phone Settings Back keeps Enter XR hidden and Lab reachable', async ({browser},testInfo)=>{
 const context=await browser.newContext({viewport:{width:390,height:664},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const page=await context.newPage();
 await page.goto(testInfo.project.use.baseURL as string);
 await page.locator('#audio-start-button').tap();
 await page.locator('#wt-loading').waitFor({state:'detached',timeout:60000});
 await page.touchscreen.tap(195,360);
 await page.waitForTimeout(2000);
 await page.touchscreen.tap(195,443);
 await page.waitForTimeout(1500);
 await testInfo.attach('phone-after-settings-back',{body:await page.screenshot(),contentType:'image/png'});
 // The Lab remains the second row. A restored XR row would intercept this
 // exact touch and try XR instead of entering the Lab.
 await page.touchscreen.tap(195,312);
 await expect.poll(()=>mode(page)).toBe('lab');
 await context.close();
});
