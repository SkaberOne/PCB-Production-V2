const { test, expect } = require('@playwright/test');

// Parcours de fumée : l'app boote (backend SQLite + build front servi par le
// backend) et la navigation latérale entre les grandes sections fonctionne.
test.describe('Smoke — démarrage et navigation', () => {
  test('le tableau de bord se charge', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('PCB FLOW')).toBeVisible();
    await expect(page).toHaveURL(/#\/dashboard/);
  });

  test('navigation latérale Import BOM puis Revue BOM', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Import BOM', exact: true }).click();
    await expect(page).toHaveURL(/#\/import-bom/);
    await expect(page.getByText('Import et pré-traitement BOM').first()).toBeVisible();

    await page.getByRole('link', { name: 'Revue BOM', exact: true }).click();
    await expect(page).toHaveURL(/#\/bom/);
  });
});
