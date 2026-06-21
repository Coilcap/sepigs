import type { Destination } from "../protocol/types.js";
import type { Logger } from "../logger/logger.js";
import { sendUdpDatagram } from "../transport/udp.js";

export class UdpDirectSender {
  public constructor(private readonly timeoutMs: number, private readonly logger: Logger) {}

  public async send(destination: Destination, payload: Buffer): Promise<Buffer | undefined> {
    return await sendUdpDatagram(destination, payload, this.timeoutMs, this.logger);
  }
}
