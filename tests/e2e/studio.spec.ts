import { expect, test } from "@playwright/test";

test("keyboard workflow produces and opens canonical evidence", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Evidence before confidence." })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();

  const scenario = page.getByRole("link", { name: /Portfolio pass/ });
  await scenario.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "New run" })).toBeVisible();

  const validate = page.getByRole("button", { name: "Validate & plan" });
  await validate.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Authoritative run plan")).toBeVisible();

  const start = page.getByRole("button", { name: "Start evaluation" });
  await expect(start).toBeEnabled();
  await start.focus();
  await page.keyboard.press("Enter");
  const result = page.getByRole("link", { name: /Open result/ });
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Evidence boundary", { exact: true })).toBeVisible();
  const firstCase = page.getByRole("link", { name: /REFUND_001/ });
  await firstCase.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Response boundary")).toBeVisible();
});

test("deep SPA routes and security headers survive production packaging", async ({ page }) => {
  const response = await page.goto("/compare");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await expect(page.getByRole("heading", { name: "Compare evidence" })).toBeVisible();
});
