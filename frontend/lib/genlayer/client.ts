"use client";

import { createClient } from "genlayer-js";
import { localnet, studionet } from "genlayer-js/chains";

// Target network. Defaults to Studionet (chain ID 61999); set
// NEXT_PUBLIC_GENLAYER_NETWORK=localnet to use the local simulator instead.
const NETWORK = process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "studionet";

/** GenLayer chain object for the configured network. */
export const GENLAYER_CHAIN = NETWORK === "localnet" ? localnet : studionet;

// Chain ID of the configured network (Studionet 0xf22f = 61999,
// Localnet 0xeec7 = 61127).
export const GENLAYER_CHAIN_ID = GENLAYER_CHAIN.id;
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN.id.toString(16)}`;

export const GENLAYER_RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ||
  GENLAYER_CHAIN.rpcUrls.default.http[0];

/** @deprecated Use GENLAYER_RPC_URL. Kept for backwards compatibility. */
export const GENLAYER_LOCALNET_RPC_URL = GENLAYER_RPC_URL;

/** Contract address, set at runtime via environment variable. */
export function getContractAddress(): string | null {
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!address) return null;
  return address;
}

/** Ethereum provider shape (MetaMask). */
interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

/**
 * Check whether MetaMask is available.
 */
export function isMetaMaskInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ethereum?.isMetaMask;
}

/** Get the current Ethereum provider (MetaMask). */
export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

/** Request accounts from MetaMask. */
export async function requestAccounts(): Promise<string[]> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    const accounts = await provider.request({
      method: "eth_requestAccounts",
    });
    return accounts as string[];
  } catch (error: any) {
    if (error.code === 4001)
      throw new Error("User rejected the connection request");
    throw new Error(`Failed to connect to MetaMask: ${error.message}`);
  }
}

/** Get current accounts without requesting permission. */
export async function getAccounts(): Promise<string[]> {
  const provider = getEthereumProvider();
  if (!provider) return [];
  try {
    const accounts = await provider.request({
      method: "eth_accounts",
    });
    return accounts as string[];
  } catch (error) {
    console.error("Error getting accounts:", error);
    return [];
  }
}

/** Get the current chain ID from MetaMask (hex string). */
export async function getCurrentChainId(): Promise<string | null> {
  const provider = getEthereumProvider();
  if (!provider) return null;
  try {
    return (await provider.request({ method: "eth_chainId" })) as string;
  } catch (error) {
    console.error("Error getting chain ID:", error);
    return null;
  }
}

/** Switch MetaMask to the configured GenLayer network. */
export async function switchToGenLayerNetwork(): Promise<void> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (error: any) {
    if ((error as any).code === 4902) {
      await addGenLayerNetwork();
    } else if ((error as any).code === 4001) {
      throw new Error("User rejected switching network");
    } else {
      throw new Error(`Failed to switch network: ${error.message}`);
    }
  }
}

/** Add the configured GenLayer network to MetaMask. */
export async function addGenLayerNetwork(): Promise<void> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: GENLAYER_CHAIN_ID_HEX,
          chainName:
            NETWORK === "localnet" ? "GenLayer Localnet" : "GenLayer Studionet",
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
          rpcUrls: [GENLAYER_RPC_URL],
          blockExplorerUrls: [],
        },
      ],
    });
  } catch (error: any) {
    if ((error as any).code === 4001)
      throw new Error("User rejected adding network");
    throw new Error(`Failed to add GenLayer network: ${error.message}`);
  }
}

/**
 * Connect MetaMask and ensure we are on the configured GenLayer network.
 * Returns the connected address.
 */
export async function connectMetaMask(): Promise<string> {
  if (!isMetaMaskInstalled())
    throw new Error("MetaMask is not installed");
  const accounts = await requestAccounts();
  if (!accounts || accounts.length === 0)
    throw new Error("No accounts found");

  const onCorrectNetwork = await isOnGenLayerNetwork();
  if (!onCorrectNetwork) await switchToGenLayerNetwork();
  return accounts[0];
}

/** Is MetaMask currently on the configured GenLayer network? */
export async function isOnGenLayerNetwork(): Promise<boolean> {
  const chainId = await getCurrentChainId();
  if (!chainId) return false;
  return parseInt(chainId, 16) === GENLAYER_CHAIN_ID;
}

/**
 * Create a GenLayer client connected to the configured network.
 *
 * When `account` is provided (wallet connected), the SDK signs transactions
 * through `window.ethereum` (MetaMask) automatically for write calls. Reads
 * work without a wallet.
 */
export function createGenLayerClient(account?: `0x${string}` | string) {
  const config: any = {
    chain: GENLAYER_CHAIN,
    endpoint: GENLAYER_RPC_URL,
  };
  if (account) config.account = account as `0x${string}`;
  try {
    return createClient(config);
  } catch (error) {
    console.error("Error creating GenLayer client:", error);
    return null;
  }
}

/** Build a GenLayer client for the currently connected wallet account. */
export async function getClient() {
  const accounts = await getAccounts();
  const address = accounts[0] as `0x${string}` | undefined;
  if (!address) return createGenLayerClient();
  return createGenLayerClient(address);
}
