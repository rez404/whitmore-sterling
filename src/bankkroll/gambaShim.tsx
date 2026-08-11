import React from "react";

export const BPS_PER_WHOLE = 10000;
export type GameResult = { resultIndex: number; multiplier: number; payout: number; profit: number; token?: string };

let lastResult: GameResult = { resultIndex: 0, multiplier: 0, payout: 0, profit: 0 };
let lastBet: number[] = [0, 2];
let lastWager = 1;

function chooseResult(bet: number[]) {
  const resultIndex = Math.floor(Math.random() * Math.max(1, bet.length));
  const multiplier = Number(bet[resultIndex] || 0);
  const payout = multiplier * lastWager;
  lastResult = { resultIndex, multiplier, payout, profit: Math.max(0, payout - lastWager), token: "RH" };
  return lastResult;
}

const GameContext = React.createContext({ game: { id: "catsino", meta: { name: "Catsino" } } as any });

export function useGamba() {
  return { isPlaying: false, nonce: 0, result: async () => lastResult };
}
export function useAccount(_addr?: any, _decoder?: any) { return null; }
export function useTransactionStore() { return { label: "", state: "none" }; }
export function useWalletAddress() { return ""; }

export function TokenValue({ amount, suffix }: any) { return <>{Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}{suffix ? ` ${suffix}` : ""}</>; }
export function EffectTest({ src }: any) { return <img className="bankkroll-effect" src={src} alt="win effect" />; }

function Button({ children, onClick, disabled, main, ...rest }: any) {
  return <button className={main ? "bankkroll-button main" : "bankkroll-button"} disabled={disabled} onClick={onClick} {...rest}>{children}</button>;
}
function PlayButton({ children, onClick, disabled }: any) { return <Button main disabled={disabled} onClick={onClick}>{children || "Play"}</Button>; }
function WagerInput({ value, onChange }: any) { return <input className="bankkroll-wager" type="number" min="0" step="0.001" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} aria-label="Wager" />; }
function Select({ options, value, onChange, label, disabled }: any) { return <select className="bankkroll-select" disabled={disabled} value={value} onChange={(e) => onChange(Number(e.target.value))}>{options.map((o: any) => <option key={o} value={o}>{label ? String(o) : o}</option>)}</select>; }
function Switch({ checked, onChange, disabled }: any) { return <button className="bankkroll-switch" disabled={disabled} onClick={() => onChange(!checked)}>{checked ? "ON" : "OFF"}</button>; }
function Responsive({ children }: any) { return <div className="bankkroll-responsive">{children}</div>; }
function Portal({ children }: any) { return <div className="bankkroll-portal">{children}</div>; }
function PortalTarget() { return null; }
function Canvas({ render }: any) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && render) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
          canvas.width = Math.floor(rect.width * dpr); canvas.height = Math.floor(rect.height * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        render({ ctx, size: { width: rect.width, height: rect.height } }, { time: t / 1000 });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);
  return <canvas className="bankkroll-canvas" ref={ref} />;
}
export const GambaUi = {
  Button, PlayButton, WagerInput, Select, Switch, Responsive, Portal, PortalTarget, Canvas, TokenValue, EffectTest,
  useGame: () => ({
    game: React.useContext(GameContext).game,
    async play({ bet, wager }: any) { lastBet = bet || [0, 2]; lastWager = Number(wager || 1); chooseResult(lastBet); await new Promise((r) => setTimeout(r, 300)); },
    async result() { return lastResult; },
  }),
};
export function useWagerInput() { return React.useState<number>(1); }
export function useSound(_map?: any) { const player = { stop() {}, loop: false }; return { play(..._args: any[]) {}, sounds: new Proxy({}, { get: () => ({ player }) }) as any }; }
export function useCurrentPool() { return { maxPayout: 1000000, token: "RH" }; }
export function useCurrentToken() { return { symbol: "RH", baseWager: 1 }; }
export function useTokenBalance() { return { balance: 1000000, bonusBalance: 0 }; }
export function useSoundStore() { return { volume: 1, set() {} }; }
export function getGameAddress(_a?: any) { return ""; }
export function decodeGame(_a?: any) { return null; }
export const toast = { error: console.warn, success: console.log };
export function useWallet() { return { connected: true, wallet: true, connect(..._args: any[]) {}, disconnect() {}, publicKey: { toBase58: () => "" } }; }
export function useWalletModal() { return { setVisible(..._args: any[]) {} }; }
export const GameShimProvider = GameContext.Provider;
