import React from "react";
import { GameShimProvider } from "./bankkroll/gambaShim";
import Dice from "./bankkroll/games/Dice";
import Slots from "./bankkroll/games/Slots";
import Flip from "./bankkroll/games/Flip";
import HiLo from "./bankkroll/games/HiLo";
import Mines from "./bankkroll/games/Mines";
import Roulette from "./bankkroll/games/Roulette";
import Plinko from "./bankkroll/games/Plinko";
import Crash from "./bankkroll/games/Crash";
import Keno from "./bankkroll/games/Keno";
import Limbo from "./bankkroll/games/Limbo";

const BANKKROLL_GAMES: Record<string, React.ComponentType<any>> = { dice: Dice, slots: Slots, flip: Flip, hilo: HiLo, mines: Mines, roulette: Roulette, plinko: Plinko, crash: Crash, keno: Keno, limbo: Limbo };

export function BankkrollGame({ id, name, description }: { id: string; name: string; description?: string }) {
  const Game = BANKKROLL_GAMES[id];
  if (!Game) return null;
  return <div className="bankkroll-exact-game"><GameShimProvider value={{ game: { id, meta: { name, description } } }}><Game logo="/logo.svg" /></GameShimProvider></div>;
}
