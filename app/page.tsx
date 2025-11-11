// app/page.tsx
'use client';

import * as React from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { formatUnits } from 'viem';

// ===== 환경변수에서 컨트랙트 주소 가져오기 =====
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as
  | `0x${string}`
  | undefined;
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as
  | `0x${string}`
  | undefined;
const SPENDER_ADDRESS = process.env.NEXT_PUBLIC_SPENDER_ADDRESS as
  | `0x${string}`
  | undefined;

// ===== ERC20 최소 ABI (allowance + symbol + decimals) =====
const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

// ===== AllowanceHygieneLog ABI =====
const hygieneAbi = [
  {
    type: 'function',
    name: 'hasCleanedOnce',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'lastCleanedAt',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'markCleaned',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

// 지갑 주소 줄여서 표시
function shortenAddress(addr?: string) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// timestamp → YYYY-MM-DD HH:mm
function formatTimestamp(ts?: bigint) {
  if (!ts || ts === BigInt(0)) return '기록 없음';
  const ms = Number(ts) * 1000;
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// allowance 위험도 간단 평가
type RiskInfo = { label: string; color: string };

function getRiskLabel(
  allowance: bigint | undefined,
  decimals: number
): RiskInfo {
  if (allowance === undefined) {
    return { label: '알 수 없음', color: 'bg-gray-200' };
  }

  const value = allowance;

  if (value === BigInt(0)) {
    return {
      label: '안전 (0, 권한 없음)',
      color: 'bg-green-100 text-green-800',
    };
  }

  const one = BigInt(10) ** BigInt(decimals);
  const thousand = one * BigInt(1000);

  if (value < one) {
    return {
      label: '낮은 위험 (1 토큰 미만)',
      color: 'bg-yellow-50 text-yellow-800',
    };
  } else if (value < thousand) {
    return {
      label: '주의 (1 ~ 1,000 토큰)',
      color: 'bg-orange-100 text-orange-800',
    };
  } else {
    return {
      label: '고위험 (1,000 토큰 이상)',
      color: 'bg-red-100 text-red-800',
    };
  }
}

export default function Page() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const {
    connectors,
    connect,
    status: connectStatus,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();

  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  // ===== 사용자가 입력하는 토큰 / spender 주소 (기본값은 env) =====
  const [tokenInput, setTokenInput] = React.useState<string>(
    TOKEN_ADDRESS ?? ''
  );
  const [spenderInput, setSpenderInput] = React.useState<string>(
    SPENDER_ADDRESS ?? ''
  );

  const normalizedTokenAddress =
    tokenInput.startsWith('0x') && tokenInput.length === 42
      ? (tokenInput as `0x${string}`)
      : undefined;

  const normalizedSpenderAddress =
    spenderInput.startsWith('0x') && spenderInput.length === 42
      ? (spenderInput as `0x${string}`)
      : undefined;

  // ===== 토큰 기본 정보 읽기 (symbol / decimals) =====
  const { data: symbolData } = useReadContract({
    abi: erc20Abi,
    address: normalizedTokenAddress,
    functionName: 'symbol',
    query: { enabled: !!normalizedTokenAddress },
  });

  const { data: decimalsData } = useReadContract({
    abi: erc20Abi,
    address: normalizedTokenAddress,
    functionName: 'decimals',
    query: { enabled: !!normalizedTokenAddress },
  });

  const tokenSymbol = (symbolData as string | undefined) ?? 'TOKEN';
  const tokenDecimals = Number((decimalsData as number | undefined) ?? 18);

  // ===== allowance 읽기 =====
  const {
    data: allowanceData,
    isLoading: isAllowanceLoading,
    isError: isAllowanceError,
    error: allowanceError,
  } = useReadContract({
    abi: erc20Abi,
    address: normalizedTokenAddress,
    functionName: 'allowance',
    args:
      address && normalizedSpenderAddress && normalizedTokenAddress
        ? [address as `0x${string}`, normalizedSpenderAddress]
        : undefined,
    query: {
      enabled:
        !!address && !!normalizedSpenderAddress && !!normalizedTokenAddress,
    },
  });

  const allowance = allowanceData as bigint | undefined;

  // ===== 내 "정리 로그" 읽기 =====
  const { data: hasCleanedData } = useReadContract({
    abi: hygieneAbi,
    address: CONTRACT_ADDRESS,
    functionName: 'hasCleanedOnce',
    args: address ? [address as `0x${string}`] : undefined,
  });
  const { data: lastCleanedData } = useReadContract({
    abi: hygieneAbi,
    address: CONTRACT_ADDRESS,
    functionName: 'lastCleanedAt',
    args: address ? [address as `0x${string}`] : undefined,
  });

  const hasCleanedOnce = Boolean(hasCleanedData as boolean | undefined);
  const lastCleanedAt = lastCleanedData as bigint | undefined;

  // allowance 숫자 포맷
  const formattedAllowance = React.useMemo(() => {
    if (allowance === undefined) return '-';
    try {
      return formatUnits(allowance, tokenDecimals);
    } catch {
      return allowance.toString();
    }
  }, [allowance, tokenDecimals]);

  const risk = getRiskLabel(allowance, tokenDecimals);

  // markCleaned 호출 핸들러
  const handleMarkCleaned = () => {
    if (!CONTRACT_ADDRESS) {
      alert('CONTRACT_ADDRESS 환경변수가 설정되어 있지 않습니다.');
      return;
    }
    if (!isConnected || !address) {
      alert('지갑부터 연결해주세요.');
      return;
    }
    // 간단한 예제용: allowance가 0일 때만 기록하도록 안내
    if (allowance !== undefined && allowance > BigInt(0)) {
      const ok = confirm(
        '현재 allowance가 0이 아닙니다.\n정말 "정리 완료"로 기록하시겠어요?'
      );
      if (!ok) return;
    }

    writeContract({
      abi: hygieneAbi,
      address: CONTRACT_ADDRESS,
      functionName: 'markCleaned',
    });
  };

  const mainConnector = connectors[0]; // 그냥 첫 번째(Injected)를 기본으로 사용

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        {/* 헤더 */}
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">
            Web3 지갑 권한 점검 DApp
            <span className="ml-2 text-sm align-middle text-slate-500">
              (Allowance Doctor)
            </span>
          </h1>
          <p className="text-sm text-slate-600">
            과목: 웹어플리케이션 보안 · 학번/이름:{' '}
            <span className="font-semibold">92313726 홍정현</span>
          </p>
          <p className="text-sm text-slate-600">
            이 앱은 사용자가 ERC-20 토큰에 대해 DApp에게 부여한
            <span className="font-semibold"> approve / allowance 권한</span>을
            확인하고, 정리(0으로 줄이기)한 뒤
            <br />그 사실을 온체인에 기록하는{' '}
            <span className="font-semibold">스마트컨트랙트 기반 DApp</span>
            입니다.
          </p>
        </header>

        {/* 지갑 연결 카드 */}
        <section className="rounded-xl bg-white p-5 shadow-sm border border-slate-100 space-y-4">
          <h2 className="text-lg font-semibold">1. 지갑 연결</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-sm">
              <p className="text-slate-700">
                메타마스크 등 브라우저 지갑을 연결하고,
                <span className="font-medium"> Sepolia 네트워크</span>인지
                확인하세요.
              </p>
              <p className="text-xs text-slate-500">
                연결 후 현재 지갑 주소와 allowance 상태를 읽어옵니다.
              </p>
              {chainId !== 11155111 && isConnected && (
                <p className="text-xs text-red-600">
                  ⚠ 현재 체인이 Sepolia가 아닐 수도 있습니다. (체인 ID:{' '}
                  {chainId}) 지갑에서 네트워크를 Sepolia로 바꿔주세요.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isConnected && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {shortenAddress(address)} 연결됨
                </span>
              )}

              {isConnected ? (
                <button
                  onClick={() => disconnect()}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  지갑 연결 해제
                </button>
              ) : (
                <button
                  onClick={() =>
                    mainConnector && connect({ connector: mainConnector })
                  }
                  disabled={connectStatus === 'pending'}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {connectStatus === 'pending' ? '연결 중...' : '지갑 연결'}
                </button>
              )}
            </div>
          </div>

          {connectError && (
            <p className="mt-1 text-xs text-red-600">
              연결 오류: {connectError.message}
            </p>
          )}
        </section>

        {/* allowance 검사 카드 */}
        <section className="rounded-xl bg-white p-5 shadow-sm border border-slate-100 space-y-4">
          <h2 className="text-lg font-semibold">
            2. 토큰 권한(allowance) 상태 확인
          </h2>

          <p className="text-xs text-slate-500">
            현재 연결된 지갑 주소를 기준으로, 아래에 입력한 토큰 주소 / spender
            주소 조합에 대한 allowance를 조회합니다.
          </p>

          {/* 주소 입력 영역 */}
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-slate-500 text-xs font-medium">
                검사 대상 토큰 주소
              </p>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.trim())}
                placeholder={
                  TOKEN_ADDRESS ?? '0x로 시작하는 ERC-20 토큰 주소를 입력하세요'
                }
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <p className="text-xs text-slate-500">
                심볼: <span className="font-semibold">{tokenSymbol}</span> ·
                소수 자리:{' '}
                <span className="font-semibold">{tokenDecimals}</span>
              </p>
              {!normalizedTokenAddress && tokenInput && (
                <p className="text-xs text-red-600">
                  토큰 주소 형식이 올바르지 않습니다.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-slate-500 text-xs font-medium">
                권한을 받은 DApp / 컨트랙트 주소 (spender)
              </p>
              <input
                value={spenderInput}
                onChange={(e) => setSpenderInput(e.target.value.trim())}
                placeholder={
                  SPENDER_ADDRESS ?? '0x로 시작하는 컨트랙트 주소를 입력하세요'
                }
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <p className="text-xs text-slate-500">
                예: DEX, NFT 마켓, 예전 테스트용 컨트랙트 등
              </p>
              {!normalizedSpenderAddress && spenderInput && (
                <p className="text-xs text-red-600">
                  spender 주소 형식이 올바르지 않습니다.
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-slate-50 p-4 text-sm space-y-2">
            <p className="font-medium text-slate-800">현재 allowance</p>
            {!isConnected ? (
              <p className="text-slate-500">지갑을 먼저 연결해주세요.</p>
            ) : !normalizedTokenAddress || !normalizedSpenderAddress ? (
              <p className="text-slate-500">
                유효한 토큰 주소와 spender 주소를 입력하면 allowance를
                조회합니다.
              </p>
            ) : isAllowanceLoading ? (
              <p className="text-slate-500">allowance 조회 중...</p>
            ) : isAllowanceError ? (
              <p className="text-xs text-red-600">
                allowance 조회 중 오류가 발생했습니다.
                <br />
                {(allowanceError as Error | undefined)?.message
                  ? `사유: ${(allowanceError as Error).message}`
                  : '사유: 알 수 없는 오류'}
              </p>
            ) : allowance === undefined ? (
              <p className="text-slate-500">
                allowance 정보를 가져올 수 없습니다.
              </p>
            ) : (
              <>
                <p className="text-slate-700">
                  이 DApp은 현재{' '}
                  <span className="font-semibold">
                    {formattedAllowance} {tokenSymbol}
                  </span>
                  를 사용자의 지갑에서 임의로 인출할 수 있는 권한을 가지고
                  있습니다.
                </p>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${risk.color}`}
                >
                  {risk.label}
                </span>
                <p className="text-xs text-slate-500">
                  실제 공격에서는 rug pull, wallet drainer 등이 이 allowance를
                  이용해 지갑에서 토큰을 가져갈 수 있습니다. 정기적으로 권한을
                  점검하고, 사용하지 않는 DApp의 권한은 0으로 줄이는 것이
                  좋습니다.
                </p>
              </>
            )}
          </div>
        </section>

        {/* 정리 완료 로그 & 버튼 */}
        <section className="rounded-xl bg-white p-5 shadow-sm border border-slate-100 space-y-4">
          <h2 className="text-lg font-semibold">
            3. 권한 정리 후, 온체인에 기록하기
          </h2>

          <div className="space-y-2 text-sm">
            <p className="text-slate-700">
              ① 메타마스크 등에서 해당 토큰의{' '}
              <span className="font-semibold">allowance를 0</span>으로 줄이세요.
            </p>
            <p className="text-slate-700">
              ② 실제로 0으로 만든 뒤, 아래 버튼을 눌러 “정리 완료”를 온체인에
              기록합니다.
            </p>
            <p className="text-xs text-slate-500">
              이 DApp은 실제 revoke 트랜잭션은 대신 보내지 않고, 사용자의 행동을
              유도하고 기록만 남깁니다.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1 text-sm">
              <p className="text-slate-700">
                내 상태:{' '}
                {hasCleanedOnce ? (
                  <span className="font-semibold text-emerald-700">
                    한 번 이상 정리 완료 기록 있음 ✅
                  </span>
                ) : (
                  <span className="font-semibold text-slate-500">
                    아직 정리 완료 기록 없음
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                마지막 기록 시각: {formatTimestamp(lastCleanedAt)}
              </p>
              {txHash && (
                <p className="text-xs text-slate-500">
                  마지막 트랜잭션 해시:{' '}
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {shortenAddress(txHash)}
                  </a>
                </p>
              )}
            </div>

            <div className="flex flex-col items-start gap-1">
              <button
                onClick={handleMarkCleaned}
                disabled={!isConnected || isWriting || isConfirming}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isWriting
                  ? '트랜잭션 전송 중...'
                  : isConfirming
                  ? '블록 확인 대기 중...'
                  : '정리 완료 기록 남기기'}
              </button>
              {(writeError || !CONTRACT_ADDRESS) && (
                <p className="text-xs text-red-600">
                  {CONTRACT_ADDRESS
                    ? `트랜잭션 오류: ${
                        (writeError as Error | null)?.message ?? ''
                      }`
                    : 'CONTRACT_ADDRESS 환경변수가 비어 있습니다.'}
                </p>
              )}
              {isConfirmed && (
                <p className="text-xs text-emerald-700">
                  ✅ 정리 완료 기록이 온체인에 저장되었습니다. (새로고침 후
                  상태를 확인해보세요)
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 설명 */}
        <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
          <p className="font-semibold">보안 포인트 요약</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              ERC-20 <code>approve</code> / <code>allowance</code> /{' '}
              <code>transferFrom</code> 관계를 시각적으로 보여주어 사용자가
              “무엇을 허용하는지” 이해하도록 돕습니다.
            </li>
            <li>
              무제한(혹은 과도한) allowance는 rug pull, wallet drainer 공격에
              악용될 수 있으므로
              <span className="font-semibold">
                {' '}
                정기적인 점검과 revoke 습관
              </span>
              이 중요합니다.
            </li>
            <li>
              이 DApp은 실제 revoke 트랜잭션을 대신 보내기보다, 사용자가 직접
              지갑에서 권한을 줄이게 하고 그 행동을{' '}
              <span className="font-semibold">온체인 로그로 남기는 설계</span>
              입니다.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
