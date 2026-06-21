import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { Duplex } from "node:stream";
import type net from "node:net";
import type { ShadowsocksCipher } from "../config/types.js";
import { ProtocolError } from "../utils/errors.js";
import { BufferQueue } from "../utils/bufferQueue.js";

interface CipherSpec {
  readonly keyLength: number;
  readonly saltLength: number;
  readonly nonceLength: number;
  readonly authTagLength: number;
  readonly nodeCipher: string;
}

const CIPHERS: Readonly<Record<ShadowsocksCipher, CipherSpec>> = {
  "aes-128-gcm": {
    keyLength: 16,
    saltLength: 16,
    nonceLength: 12,
    authTagLength: 16,
    nodeCipher: "aes-128-gcm"
  },
  "aes-256-gcm": {
    keyLength: 32,
    saltLength: 32,
    nonceLength: 12,
    authTagLength: 16,
    nodeCipher: "aes-256-gcm"
  },
  "chacha20-ietf-poly1305": {
    keyLength: 32,
    saltLength: 32,
    nonceLength: 12,
    authTagLength: 16,
    nodeCipher: "chacha20-poly1305"
  }
};

export interface ShadowsocksCryptoContext {
  readonly method: ShadowsocksCipher;
  readonly spec: CipherSpec;
  readonly masterKey: Buffer;
}

export const createShadowsocksCryptoContext = (method: ShadowsocksCipher, password: string): ShadowsocksCryptoContext => {
  const spec = CIPHERS[method];
  return {
    method,
    spec,
    masterKey: evpBytesToKey(password, spec.keyLength)
  };
};

export class ShadowsocksTcpStream extends Duplex {
  private readonly rawSocket: net.Socket;
  private readonly context: ShadowsocksCryptoContext;
  private encryptKey: Buffer | undefined;
  private readonly decryptSaltLength: number;
  private readonly prefix: Buffer;
  private encryptNonce = Buffer.alloc(12);
  private decryptNonce = Buffer.alloc(12);
  private readonly decryptBuffer = new BufferQueue();
  private decryptKey: Buffer | undefined;
  private prefixSent = false;
  private pendingPayloadLength: number | undefined;

  public constructor(rawSocket: net.Socket, context: ShadowsocksCryptoContext, prefix: Buffer, sendSaltOnCreate = true) {
    super();
    this.rawSocket = rawSocket;
    this.context = context;
    this.prefix = prefix;
    this.decryptSaltLength = context.spec.saltLength;
    if (sendSaltOnCreate) {
      this.sendSalt();
    }

    rawSocket.on("data", (chunk) => {
      this.handleEncryptedData(chunk);
    });
    rawSocket.once("error", (error) => {
      this.destroy(error);
    });
    rawSocket.once("close", () => {
      this.push(null);
      this.destroy();
    });
  }

  public setTimeout(timeoutMs: number): this {
    this.rawSocket.setTimeout(timeoutMs);
    return this;
  }

  public override _read(size: number): void {
    void size;
    // Data is pushed from the wrapped socket's data event.
  }

  public override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    try {
      const payload = this.prefixSent ? chunk : Buffer.concat([this.prefix, chunk]);
      this.prefixSent = true;
      const encrypted = encryptTcpPayload(payload, this.context, this.getEncryptKey(), () => this.nextEncryptNonce());
      this.rawSocket.write(encrypted, callback);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  public override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (!this.rawSocket.destroyed) {
      this.rawSocket.destroy();
    }
    callback(error);
  }

  private handleEncryptedData(chunk: Buffer): void {
    try {
      this.decryptBuffer.push(chunk);
      if (this.decryptKey === undefined) {
        if (this.decryptBuffer.length < this.decryptSaltLength) {
          return;
        }
        const salt = this.decryptBuffer.read(this.decryptSaltLength);
        this.decryptKey = deriveSubkey(this.context.masterKey, salt, this.context.spec.keyLength);
      }

      for (;;) {
        if (this.pendingPayloadLength === undefined) {
          const lengthCipherBytes = 2 + this.context.spec.authTagLength;
          if (this.decryptBuffer.length < lengthCipherBytes) {
            return;
          }
          const lengthPlain = aeadDecrypt(
            this.context,
            this.decryptKey,
            this.nextDecryptNonce(),
            this.decryptBuffer.read(lengthCipherBytes)
          );
          this.pendingPayloadLength = lengthPlain.readUInt16BE(0);
        }

        const payloadCipherBytes = this.pendingPayloadLength + this.context.spec.authTagLength;
        if (this.decryptBuffer.length < payloadCipherBytes) {
          return;
        }

        const payload = aeadDecrypt(this.context, this.decryptKey, this.nextDecryptNonce(), this.decryptBuffer.read(payloadCipherBytes));
        this.pendingPayloadLength = undefined;
        if (payload.byteLength > 0) {
          this.push(payload);
        }
      }
    } catch (error) {
      this.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private nextEncryptNonce(): Buffer {
    const nonce = Buffer.from(this.encryptNonce);
    incrementNonce(this.encryptNonce);
    return nonce;
  }

  private nextDecryptNonce(): Buffer {
    const nonce = Buffer.from(this.decryptNonce);
    incrementNonce(this.decryptNonce);
    return nonce;
  }

  private getEncryptKey(): Buffer {
    if (this.encryptKey === undefined) {
      this.sendSalt();
    }
    if (this.encryptKey === undefined) {
      throw new ProtocolError("failed to initialize Shadowsocks encrypt key");
    }
    return this.encryptKey;
  }

  private sendSalt(): void {
    const salt = randomBytes(this.context.spec.saltLength);
    this.encryptKey = deriveSubkey(this.context.masterKey, salt, this.context.spec.keyLength);
    this.rawSocket.write(salt);
  }
}

export const createShadowsocksServerStream = (rawSocket: net.Socket, context: ShadowsocksCryptoContext): ShadowsocksTcpStream => {
  return new ShadowsocksTcpStream(rawSocket, context, Buffer.alloc(0), false);
};

export const encryptUdpPacket = (payload: Buffer, context: ShadowsocksCryptoContext): Buffer => {
  const salt = randomBytes(context.spec.saltLength);
  const key = deriveSubkey(context.masterKey, salt, context.spec.keyLength);
  const encrypted = aeadEncrypt(context, key, Buffer.alloc(context.spec.nonceLength), payload);
  return Buffer.concat([salt, encrypted]);
};

export const decryptUdpPacket = (packet: Buffer, context: ShadowsocksCryptoContext): Buffer => {
  if (packet.byteLength < context.spec.saltLength + context.spec.authTagLength) {
    throw new ProtocolError("Shadowsocks UDP packet is too short");
  }
  const salt = packet.subarray(0, context.spec.saltLength);
  const key = deriveSubkey(context.masterKey, salt, context.spec.keyLength);
  return aeadDecrypt(context, key, Buffer.alloc(context.spec.nonceLength), packet.subarray(context.spec.saltLength));
};

const encryptTcpPayload = (
  payload: Buffer,
  context: ShadowsocksCryptoContext,
  key: Buffer,
  nextNonce: () => Buffer
): Buffer => {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < payload.byteLength; offset += 0x3fff) {
    const part = payload.subarray(offset, Math.min(offset + 0x3fff, payload.byteLength));
    const length = Buffer.alloc(2);
    length.writeUInt16BE(part.byteLength, 0);
    chunks.push(aeadEncrypt(context, key, nextNonce(), length));
    chunks.push(aeadEncrypt(context, key, nextNonce(), part));
  }
  return Buffer.concat(chunks);
};

const aeadEncrypt = (context: ShadowsocksCryptoContext, key: Buffer, nonce: Buffer, plaintext: Buffer): Buffer => {
  const cipher = createCipheriv(context.spec.nodeCipher, key, nonce) as ReturnType<typeof createCipheriv> & {
    getAuthTag(): Buffer;
  };
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]);
};

const aeadDecrypt = (context: ShadowsocksCryptoContext, key: Buffer, nonce: Buffer, ciphertextWithTag: Buffer): Buffer => {
  if (ciphertextWithTag.byteLength < context.spec.authTagLength) {
    throw new ProtocolError("AEAD ciphertext is too short");
  }
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.byteLength - context.spec.authTagLength);
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.byteLength - context.spec.authTagLength);
  const decipher = createDecipheriv(context.spec.nodeCipher, key, nonce) as ReturnType<typeof createDecipheriv> & {
    setAuthTag(tag: Buffer): void;
  };
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

const deriveSubkey = (masterKey: Buffer, salt: Buffer, keyLength: number): Buffer => {
  return Buffer.from(hkdfSync("sha1", masterKey, salt, Buffer.from("ss-subkey"), keyLength));
};

const evpBytesToKey = (password: string, keyLength: number): Buffer => {
  const passwordBuffer = Buffer.from(password, "utf8");
  const chunks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  while (Buffer.concat(chunks).byteLength < keyLength) {
    const hash = createHash("md5");
    hash.update(previous);
    hash.update(passwordBuffer);
    previous = hash.digest();
    chunks.push(previous);
  }
  return Buffer.concat(chunks).subarray(0, keyLength);
};

const incrementNonce = (nonce: Buffer): void => {
  for (let index = 0; index < nonce.byteLength; index += 1) {
    nonce[index] = ((nonce[index] ?? 0) + 1) & 0xff;
    if (nonce[index] !== 0) {
      return;
    }
  }
};
