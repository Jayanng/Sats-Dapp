import { test, expect } from '@playwright/test';

test.describe('Satoshi Vaults - Lending Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Inject a simple mock flag for the React WalletContext to pick up immediately
        await page.addInitScript(() => {
            window.localStorage.setItem('testing-mock-address', 'STMockTestnet456');
        });

        // Navigate to the Dashboard (the app will boot up and read localStorage instantly)
        await page.goto('http://localhost:5173/');

        // Wait for the mock wallet loaded text to be visible in the Navbar
        await expect(page.locator('text=STMock')).toBeVisible({ timeout: 15000 });
    });

    test('Supply sBTC Flow', async ({ page }) => {
        // Navigate to Markets tab
        await page.click('text=Markets');
        // Wait for the Markets page to load (just ensure the container exists)
        await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

        // Select the "Supply" mode in the segmented control
        await page.click('button:has-text("Supply")');

        // Click on the first asset's "Supply" action button
        const supplyButton = page.locator('table tbody tr').first().locator('button', { hasText: 'Supply' });
        await supplyButton.click();

        // Verify the Supply Modal opens
        const modal = page.locator('text=Supply sBTC').first();
        await expect(modal).toBeVisible();

        // Fill in the supply amount
        await page.fill('input[type="number"]', '0.01');

        // Ensure the Confirm button gets enabled and has the right text
        const confirmButton = page.locator('button', { hasText: 'Confirm Supply' });
        await expect(confirmButton).toBeEnabled();

        // We do NOT click confirm to avoid triggering actual @stacks/connect wallet popups during CI,
        // but we validated the entire UI state up to the handoff.
    });

    test('Borrow VUSD Flow', async ({ page }) => {
        // Navigate to Markets tab
        await page.click('text=Markets');

        // Select the "Borrow" mode in the segmented control (forces the UI to switch)
        await page.click('button:has-text("Borrow")');

        // Click on the VUSD market's "Borrow" action button
        // Just grab the first visible 'Borrow' action button in the table body
        const borrowButton = page.locator('table tbody tr button').filter({ hasText: 'Borrow' }).first();
        await expect(borrowButton).toBeVisible({ timeout: 10000 });
        await borrowButton.click();

        // Verify the Borrow Modal opens (look for "Borrow" in any heading)
        const modalHeading = page.locator('h3').filter({ hasText: 'Borrow' }).first();
        await expect(modalHeading).toBeVisible({ timeout: 10000 });

        // Fill in an amount to borrow
        await page.fill('input[type="number"]', '100');

        // Ensure the Confirm button becomes enabled
        const confirmButton = page.locator('button', { hasText: 'Confirm Borrow' });
        await expect(confirmButton).toBeEnabled();
    });

    test('Dashboard Liquidation Simulation', async ({ page }) => {
        // Liquidation relies on the dashboard Health Factor view
        await page.goto('http://localhost:5173/');

        // Open the Simulate Liquidation modal
        const simulateBtn = page.locator('button', { hasText: 'Simulate Liquidation' });
        await simulateBtn.click();

        // Verify the modal appears and explains the liquidator perspective
        await expect(page.locator('text=Liquidate Vault')).toBeVisible();
        await expect(page.locator('text=Fire Liquidation Bot')).toBeVisible();
    });

});
