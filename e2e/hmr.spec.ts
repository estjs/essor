import { expect, test } from '@playwright/test';
import { getExampleUrl } from './test-utils';

test.describe('HMR Example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getExampleUrl('hmr'));
  });

  test('should render basic content and structure', async ({ page }) => {
    // Check main heading
    await expect(page.locator('h1')).toContainText('🔥 Essor HMR Demo');

    // Check Counter component
    await expect(page.locator('h3').filter({ hasText: '🔢 Stateful Component' })).toBeVisible();

    // Check HelloWorld component
    await expect(page.locator('h3').filter({ hasText: '👋 Hello World' })).toBeVisible();
  });

  test('should display Counter component correctly', async ({ page }) => {
    const counterSection = page.locator('div').filter({ hasText: '🔢 Stateful Component' }).first();

    // Check counter heading
    await expect(counterSection.locator('h3')).toContainText('🔢 Stateful Component');

    // Check initial state
    await expect(counterSection.locator('p').nth(0)).toContainText('0');

    // Check info text
    await expect(counterSection).toContainText('State is preserved during HMR updates');
  });

  test('should handle counter operations', async ({ page }) => {
    const counterSection = page.locator('div').filter({ hasText: '🔢 Stateful Component' }).first();

    // Check initial state (should be 0)
    const countDisplay = counterSection.locator('p').first();
    await expect(countDisplay).toContainText('0');

    // Test increment
    await counterSection.locator('button').filter({ hasText: '+ Increase' }).click();
    await expect(countDisplay).toContainText('1');

    // Test multiple increments
    await counterSection.locator('button').filter({ hasText: '+ Increase' }).click();
    await counterSection.locator('button').filter({ hasText: '+ Increase' }).click();
    await expect(countDisplay).toContainText('3');

    // Test decrement
    await counterSection.locator('button').filter({ hasText: '- Decrease' }).click();
    await expect(countDisplay).toContainText('2');

    // Test multiple decrements
    await counterSection.locator('button').filter({ hasText: '- Decrease' }).click();
    await counterSection.locator('button').filter({ hasText: '- Decrease' }).click();
    await expect(countDisplay).toContainText('0');

    // Test going negative
    await counterSection.locator('button').filter({ hasText: '- Decrease' }).click();
    await expect(countDisplay).toContainText('-1');
  });

  test('should display HelloWorld component correctly', async ({ page }) => {
    const helloWorldSection = page.locator('div').filter({ hasText: '👋 Hello World' }).first();

    // Check heading
    await expect(helloWorldSection.locator('h3')).toContainText('👋 Hello World');

    // Check content
    await expect(helloWorldSection).toContainText('Edit this text to see HMR updates instantly.');

    // Check version display
    await expect(helloWorldSection).toContainText('Current Version:');
    await expect(
      helloWorldSection.locator('p').filter({ hasText: 'Current Version:' }),
    ).toBeVisible();
  });

  test('should display version from constants', async ({ page }) => {
    const helloWorldSection = page.locator('div').filter({ hasText: '👋 Hello World' }).first();

    // Check that version is displayed (the actual value may vary)
    const versionText = helloWorldSection.locator('p').filter({ hasText: 'Current Version:' });
    await expect(versionText).toBeVisible();

    // Version should be in the format like "1.0.x"
    const text = await versionText.textContent();
    expect(text).toMatch(/Current Version: \d+\.\d+\.\d+/);
  });

  test('should handle rapid counter interactions', async ({ page }) => {
    const counterSection = page.locator('div').filter({ hasText: '🔢 Stateful Component' }).first();
    const incrementButton = counterSection.locator('button').filter({ hasText: '+ Increase' });
    const countDisplay = counterSection.locator('p').first();

    // Rapidly click increment button
    for (let i = 0; i < 10; i++) {
      await incrementButton.click();
    }

    // Should handle all clicks correctly
    await expect(countDisplay).toContainText('10');

    // Test rapid decrement
    const decrementButton = counterSection.locator('button').filter({ hasText: '- Decrease' });
    for (let i = 0; i < 5; i++) {
      await decrementButton.click();
    }

    await expect(countDisplay).toContainText('5');
  });

  test('should be accessible', async ({ page }) => {
    // Check semantic structure
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h3')).toHaveCount(2); // Counter and HelloWorld headers

    // Check buttons have proper text
    const buttons = page.locator('button');
    await expect(buttons.filter({ hasText: '+ Increase' })).toHaveCount(1);
    await expect(buttons.filter({ hasText: '- Decrease' })).toHaveCount(1);

    // Test keyboard navigation
    await page.keyboard.press('Tab');

    // Buttons should be focusable
    await expect(buttons.first()).toBeFocused();
  });

  test('should load within performance budget', async ({ page }) => {
    const startTime = Date.now();

    await expect(page.locator('h1')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(2000);

    // Component interactions should be fast
    const operationStartTime = Date.now();
    const counterSection = page.locator('div').filter({ hasText: '🔢 Stateful Component' }).first();
    await counterSection.locator('button').filter({ hasText: '+ Increase' }).click();
    await expect(counterSection.locator('p').first()).toContainText('1');

    const operationTime = Date.now() - operationStartTime;
    expect(operationTime).toBeLessThan(500); // Counter operations should be immediate
  });

  test('should have proper styling', async ({ page }) => {
    // Check Counter styling
    const counterSection = page.locator('div').filter({ hasText: '🔢 Stateful Component' }).first();

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
    const helloWorldSection = page.locator('div').filter({ hasText: '👋 Hello World' }).first();

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
    const counterSection = page.locator('div').filter({ hasText: '🔢 Stateful Component' }).first();

    // Modify counter state
    await counterSection.locator('button').filter({ hasText: '+ Increase' }).click();
    await counterSection.locator('button').filter({ hasText: '+ Increase' }).click();
    await counterSection.locator('button').filter({ hasText: '+ Increase' }).click();

    await expect(counterSection.locator('p').first()).toContainText('3');

    // HelloWorld should remain unaffected (stateless)
    const helloWorldSection = page.locator('div').filter({ hasText: '👋 Hello World' }).first();
    await expect(helloWorldSection.locator('h3')).toContainText('👋 Hello World');
    await expect(helloWorldSection).toContainText('Edit this text to see HMR updates instantly.');
  });
});
