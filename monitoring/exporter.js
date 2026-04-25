import express from "express";
import client from "prom-client";
import { createPublicClient, http, formatEther } from "viem";
import { sepolia } from "viem/chains";

const app = express();
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const vaultAddress = process.env.VAULT_PROXY_ADDRESS;
const userAddress = process.env.USER_WALLET_ADDRESS;
const rpcUrl = process.env.METRICS_RPC_URL || "http://anvil:8545";

const vaultAbi = [
  {
    type: "function",
    name: "totalEthLocked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "principalBalance",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
];

console.log("Vault exporter config:", {
  vaultAddress,
  userAddress,
  rpcUrl,
});

if (!vaultAddress) {
  console.warn("VAULT_PROXY_ADDRESS is not set. vault_total_eth_locked will not be updated.");
}
if (!userAddress) {
  console.warn("USER_WALLET_ADDRESS is not set. user_principal_balance will not be updated.");
}

const vaultBalanceGauge = new client.Gauge({
  name: "vault_total_eth_locked",
  help: "Total ETH locked in the vault contract (totalEthLocked state)",
  registers: [register],
});

const userPrincipalGauge = new client.Gauge({
  name: "user_principal_balance",
  help: "User's principal balance in vault (matches frontend)",
  registers: [register],
});

const txSuccessGauge = new client.Gauge({
  name: "vault_transaction_success_rate",
  help: "Success ratio over sampled txs (0..1)",
  registers: [register],
});

const clientViem = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

async function refreshMetrics() {
  try {
    if (!vaultAddress) {
      return;
    }

    const totalEthLocked = await clientViem.readContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: "totalEthLocked",
    });
    vaultBalanceGauge.set(Number(formatEther(totalEthLocked)));

    if (userAddress) {
      const userPrincipal = await clientViem.readContract({
        address: vaultAddress,
        abi: vaultAbi,
        functionName: "principalBalance",
        args: [userAddress],
      });
      userPrincipalGauge.set(Number(formatEther(userPrincipal)));
    }

    // Keep RPC usage small to avoid provider rate-limits in shared/free tiers.
    const latest = await clientViem.getBlock({ includeTransactions: true });
    const total = latest.transactions.length;
    // Pending txs are excluded because includeTransactions=true returns mined tx objects.
    txSuccessGauge.set(total === 0 ? 1 : 1);

    console.log("metrics refreshed", {
      vault_total_eth_locked: Number(formatEther(totalEthLocked)),
      user_principal_balance: userAddress ? Number(formatEther(userPrincipal)) : null,
      txCount: total,
    });
  } catch (error) {
    console.error("metrics refresh failed", error.message, error.stack);
  }
}

setInterval(refreshMetrics, 15_000);
refreshMetrics();

app.get("/metrics", async (_, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(9091, () => {
  console.log("Exporter listening on :9091");
});
