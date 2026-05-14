import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
});

test("redirects to the first module and renders lesson content", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/modules\/gcp-fundamentals$/);
  await expect(page.getByRole("heading", { name: "GCP Fundamentals", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Full Lesson Content" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("shows module 2 in the gcp sequence", async ({ page }) => {
  await page.goto("/modules/gcp-fundamentals");

  await expect(page.getByRole("heading", { name: "GCP Sequence" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Module 2 Docker and Kubernetes Basics/ })).toBeVisible();
});

test("opens a direct module route", async ({ page }) => {
  await page.goto("/modules/docker-and-kubernetes-basics");

  await expect(page.getByRole("heading", { name: "Docker and Kubernetes Basics", level: 1 })).toBeVisible();
  await expect(page.getByText("docs/lessons/gcp/02-docker-and-kubernetes-basics.md")).toBeVisible();
});

test("search filters modules", async ({ page }) => {
  await page.goto("/modules/gcp-fundamentals");

  await page.getByLabel("Search modules").fill("cloudtrail");

  await expect(page.getByRole("button", { name: /Module 15 Security in AWS/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Module 1 GCP Fundamentals/ })).toHaveCount(0);
});

test("theme toggle persists after reload", async ({ page }) => {
  await page.goto("/modules/gcp-fundamentals");

  await page.getByRole("button", { name: "Use dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Use light mode" })).toBeVisible();
});

test("sidebar collapse persists after reload", async ({ page }) => {
  await page.goto("/modules/gcp-fundamentals");

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);

  await page.reload();

  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
});

test("module completion persists after reload", async ({ page }) => {
  await page.goto("/modules/gcp-fundamentals");

  await page.getByRole("button", { name: "Mark complete" }).click();
  await page.reload();

  await expect(page.getByRole("button", { name: "Mark incomplete" })).toBeVisible();
});
