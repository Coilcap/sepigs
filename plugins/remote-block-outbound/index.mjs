export default {
  setup(context) {
    context.registerOutboundFactory("plugin.remoteBlock", () => ({}));
  },
  handle(payload) {
    if (payload?.kind === "outbound.connect" && payload?.outboundType === "plugin.remoteBlock") {
      return { action: "block", reason: "blocked by remote plugin" };
    }
    return { action: "block", reason: "unsupported remote block RPC request" };
  }
};
