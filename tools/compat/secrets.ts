export const COMPAT_TEST_ONLY_PASSWORD = "sepigs-test-only-password-v1";
export const COMPAT_TEST_ONLY_WRONG_PASSWORD = "sepigs-test-only-wrong-password-v1";

const REDACTED = "[REDACTED_TEST_SECRET]";

export const redactCompatText = (value: string): string =>
  value
    .replaceAll(COMPAT_TEST_ONLY_PASSWORD, REDACTED)
    .replaceAll(COMPAT_TEST_ONLY_WRONG_PASSWORD, REDACTED);
