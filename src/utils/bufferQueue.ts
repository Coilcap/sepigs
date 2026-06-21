export class BufferQueue {
  private readonly chunks: Buffer[] = [];
  private headOffset = 0;
  private totalLength = 0;

  public get length(): number { return this.totalLength; }

  public push(chunk: Buffer): void {
    if (chunk.byteLength === 0) return;
    this.chunks.push(chunk);
    this.totalLength += chunk.byteLength;
  }

  public read(length: number): Buffer {
    if (!Number.isInteger(length) || length < 0 || length > this.totalLength) throw new RangeError("buffer queue read exceeds available bytes");
    if (length === 0) return Buffer.alloc(0);
    const first = this.chunks[0];
    if (first !== undefined && first.byteLength - this.headOffset >= length) {
      const output = first.subarray(this.headOffset, this.headOffset + length);
      this.headOffset += length; this.totalLength -= length;
      if (this.headOffset === first.byteLength) { this.chunks.shift(); this.headOffset = 0; }
      return output;
    }
    const output = Buffer.allocUnsafe(length); let written = 0;
    while (written < length) {
      const chunk = this.chunks[0]; if (chunk === undefined) throw new RangeError("buffer queue is empty");
      const available = chunk.byteLength - this.headOffset; const count = Math.min(available, length - written);
      chunk.copy(output, written, this.headOffset, this.headOffset + count);
      written += count; this.headOffset += count; this.totalLength -= count;
      if (this.headOffset === chunk.byteLength) { this.chunks.shift(); this.headOffset = 0; }
    }
    return output;
  }
}
