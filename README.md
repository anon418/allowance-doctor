# Web3 지갑 권한 점검 DApp (Allowance Doctor)

사용자가 특정 ERC-20 토큰에 대해 DApp/스마트컨트랙트에게 부여한 `approve / allowance` 권한을 확인하고, 그 위험도를 시각적으로 보여준 뒤 사용자가 권한을 0으로 줄이도록 안내한 뒤 그 사실을 온체인에 로그로 기록하는 애플리케이션입니다.

---

## 프로젝트 개요

- 사용자는 MetaMask 등 브라우저 지갑으로 DApp에 접속합니다.
- DApp은 지정된 토큰 주소 / spender 주소에 대해  
  `allowance(owner, spender)` 값을 읽어와 현재 권한 크기를 확인합니다.
- 읽어온 allowance를 토큰 단위로 환산하여, 다음과 같이 위험도 라벨을 붙입니다.

  - `0` → 안전 (0, 권한 없음)
  - `0 ~ 1 토큰 미만` → 낮은 위험
  - `1 ~ 1,000 토큰` → 주의
  - `1,000 토큰 이상` → 고위험 (사실상 무제한에 가까운 상태)

- 사용자는 지갑 UI(또는 다른 DApp)를 통해 직접 allowance를 0으로 줄인 뒤,  
  “정리 완료 기록 남기기” 버튼을 눌러 `AllowanceHygieneLog` 컨트랙트에  
  자신의 정리 완료 기록을 남길 수 있습니다.

---

## 주요 기능

1. 지갑 연결

   - MetaMask로 Sepolia 네트워크에 연결하고, 현재 지갑 주소를 표시합니다.
   - 연결 여부와 네트워크 상태를 화면에서 확인할 수 있습니다.

2. 토큰 권한(allowance) 조회 및 위험도 표시

- 환경변수(`NEXT_PUBLIC_TOKEN_ADDRESS`, `NEXT_PUBLIC_SPENDER_ADDRESS`)에 설정된  
  기본 토큰 / spender 주소를 사용하거나, 화면에서 사용자가 직접 입력한  
  ERC-20 토큰 / spender 주소에 대해 `allowance(owner, spender)`를 조회합니다.
- 조회된 값을 토큰 단위로 변환해 보여주고, 간단한 기준으로 위험도를 분류하여 배지 형태로 표시합니다.
- 아래 설명 영역에서 `approve / allowance / transferFrom` 관계와  
  과도한 승인 상태가 어떤 공격(rug pull, wallet drainer 등)에 악용될 수 있는지 요약합니다.

3. 권한 정리 안내 (revoke 교육)

   - DApp이 사용자를 대신해서 revoke 트랜잭션을 보내지 않고,  
     사용자가 지갑 내에서 직접 권한을 0으로 줄이도록 유도합니다.
   - 따라서 사용자는 “어느 화면에서 어떤 권한을 줄여야 하는지”를 스스로 확인할 수 있습니다.

4. 온체인 로그 기록 (AllowanceHygieneLog)
   - 사용자가 권한을 정리했다고 판단될 때,  
     `markCleaned()` 함수를 호출해 다음 정보를 온체인에 기록합니다.
     - `hasCleanedOnce[user]` : 한 번이라도 정리 완료 버튼을 누른 적이 있는지
     - `lastCleanedAt[user]` : 마지막 정리 완료 기록 시각(timestamp)
   - DApp은 이 값을 읽어 “한 번 이상 정리 완료 기록 있음 / 마지막 기록 시각”을 UI에 시각화합니다.

---

## 사용 기술

- Frontend

  - Next.js (App Router, TypeScript)
  - React
  - Tailwind CSS
  - wagmi, viem (지갑 연결 및 EVM 컨트랙트 호출)

- Smart Contract
  - Solidity ^0.8.x
  - Sepolia Testnet 배포

---

## 프로젝트의 의의

- 많은 사용자가 DeFi, NFT DApp을 사용하면서 무제한 `approve`를 눌러 놓고 그대로 방치합니다.  
  이 상태에서 DApp이 해킹되거나 악의적으로 변하면, 해당 토큰 전체가 한 번에 빠져나갈 위험이 있습니다.
- 이 프로젝트는 그런 `allowance` 문제를 눈으로 확인하고, 스스로 권한을 관리해 보는 경험을 제공하는 것을 목표로 합니다.
- 실제 토큰을 전송하거나 revoke를 대신 수행하지 않고,  
  사용자가 직접 지갑에서 권한을 조정하게 하며, 그 행동을 온체인 “습관 로그”로만 남깁니다.
- 이를 통해 Web3 환경에서
  - “토큰 권한을 주는 행위가 어떤 의미인지”
  - “왜 정기적으로 allowance를 점검해야 하는지”
  - “최소 권한 원칙(Principle of Least Privilege)이 왜 중요한지”
    를 직접 확인해 볼 수 있습니다.
