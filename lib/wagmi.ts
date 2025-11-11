// lib/wagmi.ts
import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Sepolia만 쓰는 심플한 설정
export const config = createConfig({
  chains: [sepolia],
  connectors: [
    injected(), // 브라우저 지갑(메타마스크 등)
  ],
  transports: {
    [sepolia.id]: http(), // 기본 public RPC (테스트넷이라 이 정도면 충분)
  },
});
