export const assertJsonSafe = (value: unknown, path = "payload"): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertJsonSafe(entry, `${path}[${index}]`);
    });
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonSafe(entry, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} is not JSON-safe`);
};
