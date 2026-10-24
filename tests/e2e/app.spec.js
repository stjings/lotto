import { test, expect } from "@playwright/test";
async function go(page, view) {
  await page.evaluate((v) => (location.hash = v), view);
  await expect(page.locator("#" + view)).toBeVisible();
}
async function ready(page) {
  await page.goto("./");
  await expect(page.locator("#run")).toBeEnabled();
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("mobile guided flow preserves settings, results, saved candidates and exports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.locator("#analysis")).toBeVisible();
  await expect(page.locator("#latest-draw")).toContainText("1246");
  await expect(page.locator(".frequency-cell")).toHaveCount(45);
  await noOverflow(page);
  await page.screenshot({
    path: "docs/mobile-analysis-390.png",
    fullPage: true,
  });
  await page.locator("#next-step").click();
  await expect(page.locator("#exclusions")).toBeVisible();
  await page.getByRole("button", { name: "1번 제외", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1번 제외", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator("#exclusions details summary").click();
  await page.locator("#recommend-count").fill("10");
  await page.locator("#recommend-count").dispatchEvent("change");
  await page.locator("[data-recommend]").first().uncheck();
  await page.locator("#apply-recommend").click();
  await expect(page.locator("#pool-info")).toContainText("10");
  await page.locator("#exclusions details summary").click();
  await page.screenshot({ path: "docs/mobile-390.png", fullPage: true });
  await go(page, "simulation");
  await page.locator("#save-preset").click();
  await expect(page.locator("#presets")).toContainText("제외 10개");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".result-card")).toHaveCount(20);
  await noOverflow(page);
  const first = await page
    .locator(".result-card .lotto-balls")
    .first()
    .innerText();
  await page.locator('[data-save="0"]').click();
  await expect(page.locator("#saved-count")).toHaveText("1");
  const csv = page.waitForEvent("download");
  await page.locator("#csv").click();
  expect((await csv).suggestedFilename()).toBe("lotto-lab-candidates.csv");
  await page.locator("#result-view").selectOption("baseline");
  await expect(page.locator(".result-card")).toHaveCount(20);
  await page.locator("#result-view").selectOption("selected");
  await page.evaluate(
    () => (document.querySelector("#notice").textContent = ""),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "docs/mobile-results-390.png" });
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "simulation");
  const json = page.waitForEvent("download");
  await page.locator("#export-settings").click();
  expect((await json).suggestedFilename()).toBe("lotto-lab-settings.json");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  expect(
    await page.locator(".result-card .lotto-balls").first().innerText(),
  ).toBe(first);
  await page.reload();
  await expect(page.locator("#run")).toBeEnabled();
  await go(page, "saved");
  await expect(page.locator("#tickets")).toContainText("저장 시 기준");
  await page.locator('[data-preset="0"]').click();
  await expect(page.locator("#exclusions")).toBeVisible();
  await expect(page.locator("#pool-info")).toContainText("10");
  await page.locator("#theme").click();
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test("100k Worker remains responsive, cancellation works across pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await ready(page);
  await go(page, "filters");
  await page.evaluate(() =>
    document.querySelectorAll("#filters input[type=checkbox]").forEach((el) => {
      if (el.checked) {
        el.checked = false;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }),
  );
  await go(page, "simulation");
  await page.locator("#count-preset").selectOption("100000");
  await page.evaluate(() => {
    window.ticks = 0;
    window.lastTick = performance.now();
    window.maxTickGap = 0;
    window.timer = setInterval(() => {
      window.ticks++;
      const now = performance.now();
      window.maxTickGap = Math.max(window.maxTickGap, now - window.lastTick);
      window.lastTick = now;
    }, 20);
  });
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible({ timeout: 45000 });
  await expect(page.locator("#result-summary")).toContainText("100,000");
  expect(await page.evaluate(() => window.ticks)).toBeGreaterThan(5);
  console.log(
    "100k browser metrics:",
    await page.evaluate(() => ({
      ticks: window.ticks,
      maxTickGapMs: Math.round(window.maxTickGap),
      status: document.querySelector("#run-status").textContent,
    })),
  );
  await go(page, "simulation");
  await page.locator("#run").click();
  await expect(page.locator("#run-status")).toContainText("/");
  await page.locator("#cancel").click();
  await expect(page.locator("#run-status")).toContainText("취소 · 부분 결과");
  await expect(page.locator("#run")).toBeEnabled();
  await noOverflow(page);
});
test("every page fits small screens and desktop, input errors remain clear", async ({
  page,
}) => {
  await ready(page);
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of [
      "analysis",
      "exclusions",
      "filters",
      "simulation",
      "results",
      "saved",
    ]) {
      await go(page, view);
      await noOverflow(page);
    }
  }
  await go(page, "simulation");
  await page.locator("#count").fill("100001");
  await page.locator("#run").click();
  await expect(page.locator("#notice")).toContainText("100,000");
  await page.locator("#count").fill("1000");
  await go(page, "filters");
  await page
    .locator('[data-key="sum"][data-kind="min"][type="number"]')
    .fill("200");
  await go(page, "simulation");
  await page.locator("#run").click();
  await expect(page.locator("#notice")).toContainText("범위");
  await go(page, "filters");
  await page.locator("#reset-filters").click();
  await go(page, "exclusions");
  await page.evaluate(
    () => (document.querySelector("#notice").textContent = ""),
  );
  await page.screenshot({ path: "docs/desktop-1280.png", fullPage: true });
});
test("blocked browser storage permits analysis and simulation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  await ready(page);
  await go(page, "simulation");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator(".result-card")).toHaveCount(20);
  await expect(page.locator("#notice")).toContainText("저장이 차단");
});
test("heatmap toggles exclusions, summary stays current, navigation supports back and direct links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  await page.locator('[data-frequency="1"]').click();
  await expect(page.locator("#summary-excluded")).toHaveText("1개");
  await expect(page.locator('[data-frequency="1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('.desktop-nav [data-nav="exclusions"]').click();
  await expect(page.locator("#exclusions")).toBeVisible();
  await expect(page.locator("#analysis")).toBeHidden();
  await expect(page.locator('[data-number="1"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#clear").click();
  await expect(page.locator("#summary-excluded")).toHaveText("0개");
  await go(page, "filters");
  await page
    .locator('[data-key="sum"][data-kind="min"][type="number"]')
    .fill("110");
  await expect(page.locator("#summary-filters")).toContainText("합계 110~190");
  await page.goBack();
  await expect(page.locator("#exclusions")).toBeVisible();
  await page.goto("./#simulation");
  await expect(page.locator("#simulation")).toBeVisible();
  await expect(page.locator("#filters")).toBeHidden();
  await expect(page.locator("#run")).toBeEnabled();
  await page.goto("./#unknown");
  await expect(page.locator("#analysis")).toBeVisible();
});
