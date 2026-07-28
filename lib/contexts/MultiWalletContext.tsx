'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { Address } from 'viem';
import { useWallets } from '@privy-io/react-auth';

interface WalletEntry {
  address: Address;
  label: string;
  isPrimary: boolean;
}

interface MultiWalletContextType {
  wallets: WalletEntry[];
  activeWallet: Address | undefined;
  primaryWallet: Address | undefined;
  addWallet: (address: Address, label?: string) => void;
  removeWallet: (address: Address) => void;
  setActiveWallet: (address: Address) => void;
  updateWalletLabel: (address: Address, label: string) => void;
}

const MultiWalletContext = createContext<MultiWalletContextType | undefined>(undefined);

export function MultiWalletProvider({ children }: { children: React.ReactNode }) {
  // Use Privy's useWallets to explicitly find the embedded wallet.
  // wagmi's useAccount could return any connected wallet (MetaMask, etc.),
  // but the Privy embedded wallet is the one we always want as primary.
  const { wallets: privyWallets } = useWallets();
  const connectedAddress = useMemo(() => {
    const embedded = privyWallets.find(w => w.walletClientType === 'privy');
    return embedded?.address as Address | undefined;
  }, [privyWallets]);
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [activeWallet, setActiveWalletState] = useState<Address | undefined>(undefined);

  // Hydrate from localStorage after mount to avoid SSR hydration mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dashboard_wallets');
      if (saved) {
        const parsed = JSON.parse(saved) as WalletEntry[];
        setWallets(parsed);
        if (parsed[0]?.address) {
          setActiveWalletState(parsed[0].address);
        }
      }
    } catch {
      console.warn('Failed to load saved wallets');
    }
  }, []);

  // Use a ref to access wallets inside the effect without it being a dependency
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;

  // Always set connected (Privy) wallet as primary and active.
  // Previously, if connectedAddress was already in localStorage, activeWallet
  // stayed on whatever localStorage[0] was — often a stale "Add Wallet" address.
  useEffect(() => {
    if (!connectedAddress) return;

    const alreadyExists = walletsRef.current.some(
      w => w.address.toLowerCase() === connectedAddress.toLowerCase()
    );

    if (!alreadyExists) {
      // First time seeing this wallet — add it as primary
      setWallets(prev => [
        { address: connectedAddress, label: 'WALLET', isPrimary: true },
        ...prev.filter(w => !w.isPrimary)
      ]);
    }

    // Always switch active to the connected wallet on login
    setActiveWalletState(connectedAddress);
  }, [connectedAddress]);

  // Save to localStorage when wallets change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (wallets.length > 0) {
      localStorage.setItem('dashboard_wallets', JSON.stringify(wallets));
    }
  }, [wallets]);

  // Adds a watch-only wallet and switches to it immediately so the user sees feedback.
  const addWallet = (address: Address, label?: string) => {
    if (wallets.length >= 3) {
      alert('Maximum 3 wallets (1 primary + 2 analysis wallets)');
      return;
    }

    if (wallets.some(w => w.address.toLowerCase() === address.toLowerCase())) {
      alert('Wallet already added');
      return;
    }

    setWallets(prev => [
      ...prev,
      {
        address,
        label: label || `Wallet ${prev.length + 1}`,
        isPrimary: false
      }
    ]);
    // Switch to the newly added wallet so the dashboard updates immediately
    setActiveWalletState(address);
  };

  // Remove a watch-only wallet; if it was active, fall back to primary (Privy) wallet.
  const removeWallet = (address: Address) => {
    setWallets(prev => {
      const remaining = prev.filter(w => w.address.toLowerCase() !== address.toLowerCase());
      // If we just removed the active wallet, switch back to the primary
      if (activeWallet?.toLowerCase() === address.toLowerCase()) {
        const fallback = remaining.find(w => w.isPrimary)?.address ?? remaining[0]?.address;
        setActiveWalletState(fallback);
      }
      return remaining;
    });
  };

  const setActiveWallet = (address: Address) => {
    if (wallets.some(w => w.address.toLowerCase() === address.toLowerCase())) {
      setActiveWalletState(address);
    }
  };

  const updateWalletLabel = (address: Address, label: string) => {
    setWallets(prev =>
      prev.map(w => w.address.toLowerCase() === address.toLowerCase() ? { ...w, label } : w)
    );
  };

  const primaryWallet = wallets.find(w => w.isPrimary)?.address;

  return (
    <MultiWalletContext.Provider
      value={{
        wallets,
        activeWallet,
        primaryWallet,
        addWallet,
        removeWallet,
        setActiveWallet,
        updateWalletLabel
      }}
    >
      {children}
    </MultiWalletContext.Provider>
  );
}

export function useMultiWallet() {
  const context = useContext(MultiWalletContext);
  if (!context) {
    throw new Error('useMultiWallet must be used within MultiWalletProvider');
  }
  return context;
}
