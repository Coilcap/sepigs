export default {
  name: "crash-plugin",
  start() {
    process.exit(42);
  }
};
