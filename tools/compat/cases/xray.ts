export const XRAY_M2_POLICY = {
  shadowsocks: {
    enabled: true,
    remoteClose: true
  },
  trojan: {
    remoteClose: true,
    tlsCapabilityNote: "Xray client pins the ephemeral certificate; sepigs outbound disables self-signed chain validation."
  }
} as const;
