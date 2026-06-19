export default {
  name: "echo-outbound",
  setup(context) {
    context.registerOutboundFactory("plugin.echoOutbound", (config) => ({
      tag: config.tag,
      type: config.type,
      async connect(request) {
        const net = await import("node:net");
        const socket = net.createConnection({ host: request.destination.host, port: request.destination.port });
        await new Promise((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("error", reject);
        });
        socket.setNoDelay(true);
        return { socket, outboundTag: config.tag };
      },
      async stop() {}
    }));
  }
};
