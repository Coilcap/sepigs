export const SING_BOX_M2_POLICY = {
  shadowsocks: {
    remoteClose: true,
    concurrentConnections: 8
  },
  trojan: {
    remoteClose: true,
    tlsCapabilityNote: "Ephemeral self-signed TLS proves encrypted interoperability, not public-PKI validation."
  }
} as const;
