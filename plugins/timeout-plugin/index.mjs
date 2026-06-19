export default {
  name: "timeout-plugin",
  handle() {
    return new Promise(() => undefined);
  }
};
