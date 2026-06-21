import net from "node:net";
import { readTestNetworkConfig } from "../../src/utils/testNetwork.js";

const config = readTestNetworkConfig();
const server = net.createServer();
server.once("error", (error: NodeJS.ErrnoException) => {
  console.error(JSON.stringify({ status: "blocked", host: config.host, port: config.port, code: error.code, syscall: error.syscall, message: error.message }));
  process.exitCode = 2;
});
server.listen({ host: config.host, port: config.port, ipv6Only: config.disableIpv6 ? undefined : false }, () => {
  console.log(JSON.stringify({ status: "listening", requested: config, bound: server.address() }));
  server.close();
});
