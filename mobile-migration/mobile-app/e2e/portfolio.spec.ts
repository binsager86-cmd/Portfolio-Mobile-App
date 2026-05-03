import { by, device, element, expect } from 'detox';

describe('Portfolio Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await device.setBiometricEnrollment(true);
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('should display the login screen', async () => {
    await expect(element(by.id('auth-login-screen'))).toBeVisible();
  });

  it('should login with valid credentials', async () => {
    await element(by.id('email-input')).typeText('test@portfolio.app');
    await element(by.id('password-input')).typeText('SecurePass123!');
    await element(by.id('login-button')).tap();
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
    await expect(element(by.text('Total Value'))).toBeVisible();
  });

  it('should navigate to holdings tab and show list', async () => {
    await element(by.id('tab-holdings')).tap();
    await expect(element(by.id('holdings-list'))).toBeVisible();
  });

  it('should add a transaction successfully', async () => {
    await element(by.id('add-transaction-btn')).tap();
    await element(by.id('tx-symbol-input')).typeText('ZAIN');
    await element(by.id('tx-quantity-input')).typeText('100\n');
    await element(by.id('tx-price-input')).typeText('0.45\n');
    await element(by.id('tx-save-btn')).tap();
    await expect(element(by.text('Transaction saved'))).toBeVisible();
  });
});
