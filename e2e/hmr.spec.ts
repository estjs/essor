import { expect, test } from '@playwright/test';
import { getExampleUrl } from './test-utils';

test.describe('HMR Example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getExampleUrl('hmr'));
  });

  test('should render basic content and structure', async ({ page }) => {
    // Check main heading
    await expect(page.locator('.hmr-demo-title')).toContainText('🔥 Essor HMR Demo');

    // Check Counter component
    await expect(page.locator('.counter-title')).toContainText('🔢 Stateful Component');

    // Check HelloWorld component
    await expect(page.locator('.hello-world-title')).toContainText('👋 Hello World');
  });

  test('should display Counter component correctly', async ({ page }) => {
    const counterSection = page.locator('.counter-component');

    // Check counter heading
    await expect(counterSection.locator('.counter-title')).toContainText('🔢 Stateful Component');

    // Check initial state
    const countDisplay = counterSection.locator('.counter-display');
    await expect(countDisplay).toBeVisible();
    // Wait for the count to be rendered (could be 0 or any number)
    await page.waitForTimeout(500);
    const countText = await countDisplay.textContent();
    expect(countText?.trim()).toMatch(/^-?\d+$/); // Should be a number

    // Check info text
    await expect(counterSection.locator('.counter-info')).toContainText(
      'State is preserved during HMR updates',
    );
  });

  test('should handle counter operations', async ({ page }) => {
    const counterSection = page.locator('.counter-component');

    // Check initial state (should be 0)
    const countDisplay = counterSection.locator('.counter-display');
    await expect(countDisplay).toHaveText('0');

    // Test increment
    await counterSection.locator('.counter-btn-increase').click();
    await expect(countDisplay).toHaveText('1');

    // Test multiple increments
    await counterSection.locator('.counter-btn-increase').click();
    await counterSection.locator('.counter-btn-increase').click();
    await expect(countDisplay).toHaveText('3');

    // Test decrement
    await counterSection.locator('.counter-btn-decrease').click();
    await expect(countDisplay).toHaveText('2');

    // Test multiple decrements
    await counterSection.locator('.counter-btn-decrease').click();
    await counterSection.locator('.counter-btn-decrease').click();
    await expect(countDisplay).toHaveText('0');

    // Test going negative
    await counterSection.locator('.counter-btn-decrease').click();
    await expect(countDisplay).toHaveText('-1');
  });

  test('should display HelloWorld component correctly', async ({ page }) => {
    const helloWorldSection = page.locator('.hello-world-component');

    // Check heading
    await expect(helloWorldSection.locator('.hello-world-title')).toContainText('👋 Hello World');

    // Check content
    await expect(helloWorldSection.locator('.hello-world-description')).toContainText(
      'Edit this text to see HMR updates instantly.',
    );

    // Check version display
    await expect(helloWorldSection.locator('.hello-world-version')).toContainText(
      'Current Version:',
    );
    await expect(helloWorldSection.locator('.hello-world-version')).toBeVisible();
  });

  test('should display version from constants', async ({ page }) => {
    const helloWorldSection = page.locator('.hello-world-component');

    // Check that version is displayed (the actual value may vary)
    const versionText = helloWorldSection.locator('.hello-world-version');
    await expect(versionText).toBeVisible();

    // Version should be in the format like "1.0.x"
    const text = await versionText.textContent();
    expect(text).toMatch(/Current Version:\s*\d+\.\d+\.\d+/);
  });

  test('should handle rapid counter interactions', async ({ page }) => {
    const counterSection = page.locator('.counter-component');
    const incrementButton = counterSection.locator('.counter-btn-increase');
    const countDisplay = counterSection.locator('.counter-display');

    // Rapidly click increment button
    for (let i = 0; i < 10; i++) {
      await incrementButton.click();
    }

    // Should handle all clicks correctly
    await expect(countDisplay).toHaveText('10');

    // Test rapid decrement
    const decrementButton = counterSection.locator('.counter-btn-decrease');
    for (let i = 0; i < 5; i++) {
      await decrementButton.click();
    }

    await expect(countDisplay).toContainText('5');
  });

  test('should be accessible', async ({ page }) => {
    // Check semantic structure
    await expect(page.locator('.hmr-demo-title')).toBeVisible();
    await expect(page.locator('h3')).toHaveCount(2); // Counter and HelloWorld headers

    // Check buttons have proper classes
    await expect(page.locator('.counter-btn-increase')).toHaveCount(1);
    await expect(page.locator('.counter-btn-decrease')).toHaveCount(1);

    // Test keyboard navigation
    await page.keyboard.press('Tab');

    // Buttons should be focusable
    const buttons = page.locator('button');
    await expect(buttons.first()).toBeFocused();
  });

  test('should load within performance budget', async ({ page }) => {
    const startTime = Date.now();

    await expect(page.locator('.hmr-demo-title')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(2000);

    // Component interactions should be fast
    const operationStartTime = Date.now();
    const counterSection = page.locator('.counter-component');
    await counterSection.locator('.counter-btn-increase').click();
    await expect(counterSection.locator('.counter-display')).toHaveText('1');

    const operationTime = Date.now() - operationStartTime;
    expect(operationTime).toBeLessThan(1000); // Counter operations should be fast
  });

  test('should have proper styling', async ({ page }) => {
    // Check Counter styling
    const counterSection = page.locator('.counter-component');

    // Verify border and padding are applied
    const counterStyles = await counterSection.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        border: styles.border,
        padding: styles.padding,
        borderRadius: styles.borderRadius,
      };
    });

    expect(counterStyles.padding).toBeTruthy();
    expect(counterStyles.borderRadius).toBeTruthy();

    // Check HelloWorld styling
    const helloWorldSection = page.locator('.hello-world-component');

    const helloWorldStyles = await helloWorldSection.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        background: styles.background,
        padding: styles.padding,
      };
    });

    expect(helloWorldStyles.padding).toBeTruthy();
    expect(helloWorldStyles.background).toBeTruthy();
  });

  test('should maintain independent component state', async ({ page }) => {
    const counterSection = page.locator('.counter-component');

    // Modify counter state
    await counterSection.locator('.counter-btn-increase').click();
    await counterSection.locator('.counter-btn-increase').click();
    await counterSection.locator('.counter-btn-increase').click();

    await expect(counterSection.locator('.counter-display')).toHaveText('3');

    // HelloWorld should remain unaffected (stateless)
    const helloWorldSection = page.locator('.hello-world-component');
    await expect(helloWorldSection.locator('.hello-world-title')).toContainText('👋 Hello World');
    await expect(helloWorldSection.locator('.hello-world-description')).toContainText(
      'Edit this text to see HMR updates instantly.',
    );
  });
});
