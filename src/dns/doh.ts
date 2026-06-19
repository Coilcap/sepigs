import http from "node:http";
import https from "node:https";
import type { DohConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { NetworkError, TimeoutError } from "../utils/errors.js";
import type { DnsAResult } from "./resolver.js";

export const queryDohA = async (host: string, config: DohConfig, logger: Logger): Promise<DnsAResult> => {
  let lastError: unknown;
  for (const endpoint of config.endpoints) {
    try {
      return await queryOneDohEndpoint(host, endpoint, config.timeoutMs);
    } catch (error) {
      lastError = error;
      logger.warn("DoH upstream failed", {
        endpoint,
        host,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  throw lastError instanceof Error ? lastError : new NetworkError(`DoH query failed for ${host}`);
};

const queryOneDohEndpoint = async (host: string, endpoint: string, timeoutMs: number): Promise<DnsAResult> => {
  const url = new URL(endpoint);
  const body = encodeDnsQuery(Math.floor(Math.random() * 0xffff), host);
  const client = url.protocol === "http:" ? http : https;

  return await new Promise<DnsAResult>((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "POST",
        headers: {
          accept: "application/dns-message",
          "content-type": "application/dns-message",
          "content-length": String(body.byteLength)
        },
        timeout: timeoutMs
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("end", () => {
          if (response.statusCode !== 200) {
            reject(new NetworkError(`DoH upstream returned HTTP ${response.statusCode ?? 0}`));
            return;
          }
          try {
            resolve(decodeDnsAResponse(Buffer.concat(chunks), body.readUInt16BE(0)));
          } catch (error) {
            reject(error instanceof Error ? error : new NetworkError(String(error)));
          }
        });
      }
    );

    request.once("timeout", () => {
      request.destroy(new TimeoutError(`DoH query timeout after ${timeoutMs}ms for ${host}`));
    });
    request.once("error", reject);
    request.end(body);
  });
};

const encodeDnsQuery = (id: number, host: string): Buffer => {
  const labels = host.split(".");
  const questionParts = labels.flatMap((label) => [Buffer.from([Buffer.byteLength(label)]), Buffer.from(label, "ascii")]);
  return Buffer.concat([
    Buffer.from([
      (id >> 8) & 0xff,
      id & 0xff,
      0x01,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    ]),
    ...questionParts,
    Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01])
  ]);
};

const decodeDnsAResponse = (message: Buffer, expectedId: number): DnsAResult => {
  if (message.byteLength < 12) {
    throw new NetworkError("invalid DNS response");
  }
  const id = ((message[0] ?? 0) << 8) + (message[1] ?? 0);
  if (id !== expectedId) {
    throw new NetworkError("DNS response id mismatch");
  }
  const answerCount = ((message[6] ?? 0) << 8) + (message[7] ?? 0);
  let offset = 12;
  offset = skipDnsName(message, offset) + 4;
  for (let answer = 0; answer < answerCount; answer += 1) {
    offset = skipDnsName(message, offset);
    if (offset + 10 > message.byteLength) {
      throw new NetworkError("truncated DNS answer");
    }
    const type = ((message[offset] ?? 0) << 8) + (message[offset + 1] ?? 0);
    const klass = ((message[offset + 2] ?? 0) << 8) + (message[offset + 3] ?? 0);
    const ttl = message.readUInt32BE(offset + 4);
    const length = ((message[offset + 8] ?? 0) << 8) + (message[offset + 9] ?? 0);
    offset += 10;
    if (offset + length > message.byteLength) {
      throw new NetworkError("truncated DNS rdata");
    }
    if (type === 1 && klass === 1 && length === 4) {
      return {
        address: `${message[offset] ?? 0}.${message[offset + 1] ?? 0}.${message[offset + 2] ?? 0}.${message[offset + 3] ?? 0}`,
        ttlMs: Math.max(1_000, ttl * 1_000)
      };
    }
    offset += length;
  }
  throw new NetworkError("DNS response did not contain an A record");
};

const skipDnsName = (message: Buffer, offset: number): number => {
  let cursor = offset;
  while (cursor < message.byteLength) {
    const length = message[cursor] ?? 0;
    if ((length & 0xc0) === 0xc0) {
      return cursor + 2;
    }
    cursor += 1;
    if (length === 0) {
      return cursor;
    }
    cursor += length;
  }
  throw new NetworkError("truncated DNS name");
};
