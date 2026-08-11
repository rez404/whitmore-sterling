// src/components/ui/GambaPlayButton.tsx

import { GambaUi } from "../gambaShim";
import React from "react";
import { useWallet } from "../gambaShim";
import { useWalletModal } from "../gambaShim";

interface GambaPlayButtonProps {
  disabled?: boolean;
  onClick: () => void;
  text: string;
}

interface GambaButtonProps {
  disabled?: boolean;
  onClick: () => void;
  text: string;
}

export const GambaButton = ({ disabled, onClick, text }: GambaButtonProps) => {
  return (
    <GambaUi.Button main disabled={disabled} onClick={onClick}>
      {text}
    </GambaUi.Button>
  );
};

const GambaPlayButton = ({ disabled, onClick, text }: GambaPlayButtonProps) => {
  const walletModal = useWalletModal();
  const wallet = useWallet();

  const connect = () => {
    if (wallet.wallet) {
      wallet.connect();
    } else {
      walletModal.setVisible(true);
    }
  };

  return wallet.connected ? (
    <GambaUi.Button main disabled={disabled} onClick={onClick}>
      {text}
    </GambaUi.Button>
  ) : (
    <GambaUi.Button main disabled={disabled} onClick={connect}>
      {text}
    </GambaUi.Button>
  );
};

export default GambaPlayButton;
