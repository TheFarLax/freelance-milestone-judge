"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  isMetaMaskInstalled,
  connectMetaMask,
  getAccounts,
  getCurrentChainId,
  isOnGenLayerNetwork,
  getEthereumProvider,
  GENLAYER_CHAIN_ID,
} from "./client";

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export interface WalletState {
  address: string | null;
  chainId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  isMetaMaskInstalled: boolean;
  isOnCorrectNetwork: boolean;
}

interface WalletContextValue extends WalletState {
  connectWallet: () => Promise<string>;
  disconnectWallet: () => void;
}

// localStorage key for tracking the user's disconnect intent.
const DISCONNECT_FLAG = "fmj_wallet_disconnected";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    isConnected: false,
    isLoading: true,
    isMetaMaskInstalled: false,
    isOnCorrectNetwork: false,
  });

  useEffect(() => {
    let mounted = true;
    const initWallet = async () => {
      const installed = isMetaMaskInstalled();
      if (!installed) {
        if (mounted) {
          setState({
            address: null,
            chainId: null,
            isConnected: false,
            isLoading: false,
            isMetaMaskInstalled: false,
            isOnCorrectNetwork: false,
          });
        }
        return;
      }

      if (typeof window !== "undefined") {
        const wasDisconnected =
          localStorage.getItem(DISCONNECT_FLAG) === "true";
        if (wasDisconnected) {
          if (mounted) {
            setState({
              address: null,
              chainId: null,
              isConnected: false,
              isLoading: false,
              isMetaMaskInstalled: true,
              isOnCorrectNetwork: false,
            });
          }
          return;
        }
      }

      try {
        const accounts = await getAccounts();
        const chainId = await getCurrentChainId();
        const correctNetwork = await isOnGenLayerNetwork();
        if (mounted) {
          setState({
            address: accounts[0] || null,
            chainId,
            isConnected: accounts.length > 0,
            isLoading: false,
            isMetaMaskInstalled: true,
            isOnCorrectNetwork: correctNetwork,
          });
        }
      } catch (error) {
        console.error("Error initializing wallet:", error);
        if (mounted) {
          setState({
            address: null,
            chainId: null,
            isConnected: false,
            isLoading: false,
            isMetaMaskInstalled: true,
            isOnCorrectNetwork: false,
          });
        }
      }
    };

    initWallet();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const provider = getEthereumProvider();
    if (!provider) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length > 0 && typeof window !== "undefined") {
        localStorage.removeItem(DISCONNECT_FLAG);
      }
      const chainId = await getCurrentChainId();
      const correctNetwork = await isOnGenLayerNetwork();
      setState((prev) => ({
        ...prev,
        address: accounts[0] || null,
        chainId,
        isConnected: accounts.length > 0,
        isOnCorrectNetwork: correctNetwork,
      }));
    };

    const handleChainChanged = (chainId: string) => {
      const correctNetwork = parseInt(chainId, 16) === GENLAYER_CHAIN_ID;
      setState((prev) => ({
        ...prev,
        chainId,
        isOnCorrectNetwork: correctNetwork,
      }));
    };

    const handleDisconnect = () => {
      setState((prev) => ({
        ...prev,
        address: null,
        isConnected: false,
      }));
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    provider.on("disconnect", handleDisconnect);

    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
      provider.removeListener("disconnect", handleDisconnect);
    };
  }, []);

  const connectWallet = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const address = await connectMetaMask();
      const chainId = await getCurrentChainId();
      const correctNetwork = await isOnGenLayerNetwork();
      if (typeof window !== "undefined") {
        localStorage.removeItem(DISCONNECT_FLAG);
      }
      setState({
        address,
        chainId,
        isConnected: true,
        isLoading: false,
        isMetaMaskInstalled: true,
        isOnCorrectNetwork: correctNetwork,
      });
      return address;
    } catch (err: any) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw err;
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISCONNECT_FLAG, "true");
    }
    setState((prev) => ({
      ...prev,
      address: null,
      isConnected: false,
    }));
  }, []);

  const value: WalletContextValue = {
    ...state,
    connectWallet,
    disconnectWallet,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
