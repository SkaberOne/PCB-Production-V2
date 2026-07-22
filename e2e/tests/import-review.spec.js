const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'E2ETEST_TOP.txt');

// Parcours critique : upload d'un fichier BOM (.txt Eagle machine) -> parsing ->
// import dans la session. La base e2e étant vierge, l'import ouvre la résolution
// des composants absents en listant les références importées : c'est la preuve
// déterministe que l'upload a été parsé et importé (5 lignes du fixture).
test.describe('Import BOM', () => {
  test('uploader un fichier BOM le parse et l\'importe', async ({ page }) => {
    await page.goto('/#/import-bom');
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    await page.getByRole('button', { name: /^Importer$/i }).click();

    // L'import a réussi : la résolution des composants absents s'ouvre et liste
    // les références du fichier (R1..C2).
    await expect(page.getByRole('heading', { name: 'Composant absent de la base' })).toBeVisible();
    await expect(page.getByText('R1', { exact: true })).toBeVisible();
  });
});
