import { useMemo, useState } from "react";
import { formatEther, isAddress, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { vaultAbi } from "./vaultAbi";

const vaultAddress = import.meta.env.VITE_VAULT_PROXY_ADDRESS?.trim().toLowerCase();
const sepoliaChainId = 11155111;

function formatEth(value) {
  if (!value) return "0.0";
  return Number(formatEther(value)).toFixed(6);
}

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, switchChainAsync } = useSwitchChain();

  const [depositAmount, setDepositAmount] = useState("0.01");
  const [withdrawAmount, setWithdrawAmount] = useState("0.01");
  const [errorMsg, setErrorMsg] = useState("");
  const [txAction, setTxAction] = useState("");

  const { data: principal } = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "principalBalance",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && vaultAddress) },
  });

  const { data: rewards } = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "pendingRewards",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && vaultAddress) },
  });

  const potentialTotal = useMemo(() => {
    const p = principal || 0n;
    const r = rewards || 0n;
    return p + r;
  }, [principal, rewards]);

  const {
    data: txHash,
    isPending: isWritePending,
    isError: isWriteError,
    error: writeError,
    writeContract,
    reset,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });
  const hasValidVaultAddress = Boolean(vaultAddress && isAddress(vaultAddress, { strict: false }));
  const isOnSepolia = chainId === sepoliaChainId;
  const isAwaitingWalletSignature = isWritePending && !txHash;
  const isAwaitingOnchainConfirmation = Boolean(txHash) && isConfirming;
  const isDepositDisabled =
    !isConnected || !hasValidVaultAddress || !isOnSepolia || isAwaitingWalletSignature || isAwaitingOnchainConfirmation;

  let disabledReason = "";
  if (!isConnected) disabledReason = "Connect MetaMask first.";
  else if (!hasValidVaultAddress) disabledReason = "Set a valid VITE_VAULT_PROXY_ADDRESS and restart Vite.";
  else if (!isOnSepolia) disabledReason = "Switch wallet network to Sepolia.";
  else if (isAwaitingWalletSignature) disabledReason = "Confirm the transaction in MetaMask.";
  else if (isAwaitingOnchainConfirmation) disabledReason = "Transaction sent. Waiting for block confirmation...";

  const onDeposit = async () => {
    setErrorMsg("");
    setTxAction("deposit");
    if (!depositAmount || Number(depositAmount) <= 0) {
      setErrorMsg("Deposit amount must be greater than 0.");
      return;
    }
    try {
      if (!isOnSepolia) {
        if (switchChainAsync) {
          await switchChainAsync({ chainId: sepoliaChainId });
        } else if (switchChain) {
          switchChain({ chainId: sepoliaChainId });
          setErrorMsg("Please approve network switch to Sepolia, then click Deposit again.");
          return;
        }
      }
      writeContract({
        chainId: sepoliaChainId,
        address: vaultAddress,
        abi: vaultAbi,
        functionName: "deposit",
        value: parseEther(depositAmount),
      });
    } catch (error) {
      setErrorMsg(error?.shortMessage || error?.message || "Deposit failed.");
    }
  };

  const onWithdraw = async () => {
    setErrorMsg("");
    setTxAction("withdraw");
    if (!withdrawAmount || Number(withdrawAmount) <= 0) {
      setErrorMsg("Withdraw amount must be greater than 0.");
      return;
    }
    try {
      if (!isOnSepolia) {
        if (switchChainAsync) {
          await switchChainAsync({ chainId: sepoliaChainId });
        } else if (switchChain) {
          switchChain({ chainId: sepoliaChainId });
          setErrorMsg("Please approve network switch to Sepolia, then click Withdraw again.");
          return;
        }
      }
      writeContract({
        chainId: sepoliaChainId,
        address: vaultAddress,
        abi: vaultAbi,
        functionName: "withdraw",
        args: [parseEther(withdrawAmount)],
      });
    } catch (error) {
      setErrorMsg(error?.shortMessage || error?.message || "Withdraw failed.");
    }
  };

  return (
    <main className="container">
      <h1>ETH Vault Dashboard (Sepolia)</h1>
      {!isConnected ? (
        <button onClick={() => connect({ connector: connectors[0] })}>Connect MetaMask</button>
      ) : (
        <button onClick={() => disconnect()}>Disconnect {address?.slice(0, 6)}...</button>
      )}
      <p>Current wallet chain ID: {chainId ?? "unknown"}</p>
      {isConnected && !isOnSepolia && (
        <p>
          Wrong network detected.{" "}
          <button onClick={() => switchChain({ chainId: sepoliaChainId })}>Switch to Sepolia</button>
        </p>
      )}

      <section className="card">
        <h2>Your Vault Position</h2>
        <p>Principal: {formatEth(principal)} ETH</p>
        <p>Pending rewards: {formatEth(rewards)} ETH</p>
        <p>Potential total: {formatEth(potentialTotal)} ETH</p>
      </section>

      <section className="card">
        <h2>Deposit</h2>
        <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
        <button disabled={isDepositDisabled} onClick={onDeposit}>
          {isAwaitingWalletSignature
            ? "Awaiting Signature..."
            : isAwaitingOnchainConfirmation
            ? "Confirming..."
            : "Deposit"}
        </button>
        {isDepositDisabled && <p className="err">{disabledReason}</p>}
        {txHash && (
          <p>
            Tx:{" "}
            <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </p>
        )}
        {isSuccess && (
          <p className="ok">
            Success:{" "}
            <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
              View transaction
            </a>{" "}
            <button onClick={() => reset()}>Dismiss</button>
          </p>
        )}
        {(isWriteError || isReceiptError || errorMsg) && (
          <p className="err">
            Error: {errorMsg || writeError?.shortMessage || receiptError?.message || "Transaction reverted."}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Withdraw</h2>
        <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
        <button disabled={isDepositDisabled} onClick={onWithdraw}>
          {isAwaitingWalletSignature
            ? "Awaiting Signature..."
            : isAwaitingOnchainConfirmation
            ? "Confirming..."
            : "Withdraw"}
        </button>
        {isDepositDisabled && <p className="err">{disabledReason}</p>}
      </section>

      {isSuccess && txAction && (
        <p className="ok">Latest action confirmed: {txAction}</p>
      )}
    </main>
  );
}
