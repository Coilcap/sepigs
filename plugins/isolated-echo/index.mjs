export default {
  name: "isolated-echo",
  handle(payload) {
    return { ok: true, payload };
  }
};
