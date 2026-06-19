export default {
  name: "wasm-header-transform",
  setup(context) {
    context.logger.debug("available wasm extensions", { wasm: context.wasmExtensions.list() });
  }
};
