export type CompatibilityResult = "verified" | "failed" | "skipped" | "blocked" | "unsupported";

export type ReferenceImplementation =
  | "shadowsocks-rust"
  | "shadowsocks-libev"
  | "sing-box"
  | "xray"
  | "trojan-go";

export interface ExternalCompatibilityCase {
  readonly caseId: string;
  readonly referenceImplementation: ReferenceImplementation;
  readonly referenceVersion: string;
  readonly sepigsRole: "inbound" | "outbound";
  readonly protocol: "shadowsocks" | "trojan";
  readonly cipher?: string;
  readonly payloadSize: number;
  readonly command: string;
  readonly result: CompatibilityResult;
  readonly reason: string;
  readonly stdoutExcerpt: string;
  readonly stderrExcerpt: string;
  readonly reproductionCommand: string;
  readonly artifactPath: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface CompatibilitySummary {
  readonly verified: number;
  readonly failed: number;
  readonly skipped: number;
  readonly blocked: number;
  readonly unsupported: number;
}

export const summarizeCases = (cases: readonly ExternalCompatibilityCase[]): CompatibilitySummary => ({
  verified: cases.filter((item) => item.result === "verified").length,
  failed: cases.filter((item) => item.result === "failed").length,
  skipped: cases.filter((item) => item.result === "skipped").length,
  blocked: cases.filter((item) => item.result === "blocked").length,
  unsupported: cases.filter((item) => item.result === "unsupported").length
});
