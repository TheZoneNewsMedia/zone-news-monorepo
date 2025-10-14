/**
 * Simple test to verify Jest setup
 */

describe('Basic Jest Setup', () => {
  test('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should have test environment variables', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.TELEGRAM_BOT_TOKEN).toBeDefined();
  });

  test('should have global test utilities', () => {
    expect(global.testUtils).toBeDefined();
    expect(global.testUtils.mockBot).toBeDefined();
    expect(global.testUtils.createMockContext).toBeInstanceOf(Function);
  });
});