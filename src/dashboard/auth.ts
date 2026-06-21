import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export const dashboardAuthorized = (request: IncomingMessage, expectedToken: string): boolean => {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) {
    return false;
  }
  const actual = Buffer.from(header.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
};
