export default {
  setup(context) {
    context.registerOutboundFactory("plugin.remoteDenied", () => ({}));
  },
  handle() {
    return { action: "direct" };
  }
};
