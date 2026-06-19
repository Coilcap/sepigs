export default {
  setup(context) {
    context.registerOutboundFactory("plugin.remoteEcho", () => ({}));
  },
  handle(payload) {
    if (payload?.kind === "outbound.connect" && payload?.outboundType === "plugin.remoteEcho") {
      return { action: "direct" };
    }
    return { action: "block", reason: "unsupported remote echo RPC request" };
  }
};
