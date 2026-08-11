"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useOutsideClick } from "@/hooks/use-outside-click";
import type { MarketConfig } from "@/src/markets";

type StockProfile = {
  description: string;
  marketCap: string;
  sector: string;
};

const STOCK_PROFILES: Record<string, StockProfile> = {
  AAPL: { marketCap: "$4.66T", sector: "Consumer technology", description: "Apple designs iPhone, Mac, iPad, wearables, services, and the software ecosystem that ties them together." },
  AMD: { marketCap: "$871.37B", sector: "Semiconductors", description: "Advanced Micro Devices builds CPUs, GPUs, accelerators, and embedded chips used across PCs, gaming, data centers, and AI infrastructure." },
  AMZN: { marketCap: "$2.66T", sector: "Commerce / cloud", description: "Amazon operates global ecommerce, logistics, ads, Prime media, and AWS cloud infrastructure." },
  BABA: { marketCap: "$269.28B", sector: "China internet", description: "Alibaba operates commerce marketplaces, cloud infrastructure, logistics, and digital services across China and international markets." },
  COIN: { marketCap: "$41.46B", sector: "Crypto infrastructure", description: "Coinbase is a regulated crypto exchange and infrastructure company serving retail users, institutions, developers, and stablecoin ecosystems." },
  CRCL: { marketCap: "$16.83B", sector: "Stablecoins", description: "Circle Internet Group issues and operates USDC-focused stablecoin infrastructure, payments products, and compliance-first digital dollar rails." },
  CRWV: { marketCap: "$45.45B", sector: "AI cloud", description: "CoreWeave provides GPU-accelerated cloud infrastructure for AI training, inference, rendering, and high-performance workloads." },
  GOOGL: { marketCap: "$4.28T", sector: "Search / AI", description: "Alphabet owns Google Search, YouTube, Android, Google Cloud, Waymo, and major AI research and infrastructure businesses." },
  INTC: { marketCap: "$518.28B", sector: "Semiconductors", description: "Intel designs processors, platform silicon, networking chips, and is rebuilding a foundry business for advanced semiconductor manufacturing." },
  META: { marketCap: "$1.67T", sector: "Social / AI", description: "Meta operates Facebook, Instagram, WhatsApp, Threads, ads infrastructure, AI systems, and Reality Labs." },
  MSFT: { marketCap: "$2.90T", sector: "Software / cloud", description: "Microsoft operates Windows, Office, Azure, GitHub, LinkedIn, Xbox, and AI infrastructure across enterprise and consumer markets." },
  MU: { marketCap: "$1.06T", sector: "Memory chips", description: "Micron manufactures DRAM, NAND, and memory/storage products used in AI servers, PCs, mobile devices, autos, and industrial systems." },
  NVDA: { marketCap: "$4.93T", sector: "AI semiconductors", description: "NVIDIA designs GPUs, networking, AI software, and accelerated computing platforms powering data centers, robotics, gaming, and simulation." },
  ORCL: { marketCap: "$378.89B", sector: "Enterprise software", description: "Oracle provides databases, enterprise applications, cloud infrastructure, and mission-critical software for large organizations." },
  PLTR: { marketCap: "$311.74B", sector: "Data platforms", description: "Palantir builds data integration, analytics, and AI operating systems used by governments and enterprises." },
  QQQ: { marketCap: "ETF AUM", sector: "Nasdaq 100 ETF", description: "QQQ tracks the Nasdaq-100 index, giving diversified exposure to large non-financial technology and growth companies." },
  SGOV: { marketCap: "ETF AUM", sector: "Treasury ETF", description: "SGOV is an ETF focused on short-term U.S. Treasury bills, often used as a cash-like yield instrument." },
  SLV: { marketCap: "ETF AUM", sector: "Silver ETF", description: "SLV is an ETF designed to track silver prices, giving liquid exposure to physical silver market movements." },
  SNDK: { marketCap: "$247.89B", sector: "Storage", description: "SanDisk-branded storage exposure represents flash memory, storage devices, and data storage demand across consumer and enterprise markets." },
  SPCX: { marketCap: "ETF AUM", sector: "SPAC ETF", description: "SPCX provides exposure to special purpose acquisition companies and related public-market blank-check vehicles." },
  SPY: { marketCap: "ETF AUM", sector: "S&P 500 ETF", description: "SPY tracks the S&P 500, giving broad exposure to large-cap U.S. equities across sectors." },
  TSLA: { marketCap: "$1.48T", sector: "EVs / energy / AI", description: "Tesla builds electric vehicles, energy storage, charging infrastructure, autonomy software, robotics, and AI-driven mobility systems." },
  USAR: { marketCap: "N/A", sector: "Industrial / materials", description: "USAR is listed as a tokenized equity market. Review issuer disclosures and oracle status before treating it as collateral." },
  USO: { marketCap: "ETF AUM", sector: "Oil ETF", description: "USO is an oil-linked fund designed to provide exposure to crude oil futures and energy-market movements." },
};

const stockImage = (symbol: string) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 400'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%239b8f7a'/><stop offset='0.42' stop-color='%23b9b9bb'/><stop offset='0.65' stop-color='%23a64b4b'/><stop offset='1' stop-color='%236f7880'/></linearGradient></defs><rect width='640' height='400' fill='%23050505'/><rect x='34' y='34' width='572' height='332' rx='30' fill='url(%23g)' opacity='.24'/><path d='M54 300 L160 248 L238 274 L326 164 L414 204 L542 98' fill='none' stroke='%239b8f7a' stroke-width='12' stroke-linecap='round' stroke-linejoin='round'/><text x='52' y='118' font-family='Space Grotesk,Arial' font-size='78' font-weight='700' fill='%23f7f7f7'>${symbol}</text><text x='54' y='344' font-family='Space Grotesk,Arial' font-size='24' fill='%23b9b9bb'>Whitmore Sterling Market</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export default function ExpandableCardDemo({
  markets,
  onSelect,
}: {
  markets: MarketConfig[];
  onSelect?: (market: MarketConfig) => void;
}) {
  const cards = useMemo(() => markets.map((market) => ({
    ...market,
    src: stockImage(market.symbol),
    ctaText: "Select",
    ctaLink: `https://robinhoodchain.blockscout.com/address/${market.token}`,
    profile: STOCK_PROFILES[market.symbol] ?? { marketCap: "N/A", sector: "Listed market", description: `${market.name} is a listed tokenized equity collateral market.` },
  })), [markets]);

  const [active, setActive] = useState<(typeof cards)[number] | boolean | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(false);
    }
    document.body.style.overflow = active && typeof active === "object" ? "hidden" : "auto";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  useOutsideClick(ref, () => setActive(null));

  return (
    <>
      <AnimatePresence>
        {active && typeof active === "object" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 h-full w-full z-50" />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && typeof active === "object" ? (
          <div className="fixed inset-0 grid place-items-center z-[100] px-4">
            <motion.button
              key={`button-${active.symbol}-${id}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="flex absolute top-4 right-4 items-center justify-center bg-[#f4f1ea] rounded-full h-10 w-10"
              onClick={() => setActive(null)}
              aria-label="Close market details"
            >
              <CloseIcon />
            </motion.button>
            <motion.div
              layoutId={`card-${active.symbol}-${id}`}
              ref={ref}
              className="w-full max-w-[680px] max-h-[90vh] flex flex-col bg-[#101210] border border-white/15 rounded-3xl overflow-hidden shadow-2xl"
            >
              <motion.div layoutId={`image-${active.symbol}-${id}`}>
                <img width={680} height={300} src={active.src} alt={`${active.symbol} market graphic`} className="w-full h-56 object-cover object-center" />
              </motion.div>
              <div className="p-5 md:p-6 grid gap-5 overflow-auto">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <motion.h3 layoutId={`title-${active.symbol}-${id}`} className="font-bold text-3xl text-[#f4f1ea] tracking-tight">{active.symbol}</motion.h3>
                    <motion.p layoutId={`description-${active.name}-${id}`} className="text-[#a7a29a]">{active.name} · {active.profile.sector}</motion.p>
                  </div>
                  <motion.a layoutId={`button-${active.symbol}-${id}`} href={active.ctaLink} target="_blank" rel="noreferrer" className="px-4 py-3 text-sm rounded-full font-bold bg-[#9b8f7a] text-[#050505] whitespace-nowrap">Explorer</motion.a>
                </div>
                <div className="grid md:grid-cols-3 gap-2">
                  <Metric label="Collateral threshold" value={`${(active.collateralFactorBps / 100).toFixed(2)}%`} />
                  <Metric label="Liquidation point" value={`${(active.liquidationThresholdBps / 100).toFixed(2)}%`} danger />
                  <Metric label="Market cap" value={active.profile.marketCap} blue />
                </div>
                <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[#c8c2b6] text-sm md:text-base leading-7 grid gap-4">
                  <p>{active.profile.description}</p>
                  <p>This market uses the Chainlink SVR feed at <span className="text-[#9b8f7a] break-all">{active.feed}</span>. Borrow capacity is capped at {Number(active.borrowCap) / 1e18 > 0 ? `$${(Number(active.borrowCap) / 1e18).toLocaleString()}` : "the configured on-chain cap"} USDG, with a liquidation bonus of {(active.liquidationBonusBps / 100).toFixed(2)}%.</p>
                </motion.div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <ul className="stock-card-list" aria-label="Expandable listed stock-token markets">
        {cards.map((card) => (
          <motion.li layoutId={`card-${card.symbol}-${id}`} key={`card-${card.symbol}-${id}`} className="stock-card-row">
            <button type="button" onClick={() => { setActive(card); onSelect?.(card); }} className="stock-card-button" aria-label={`Open ${card.symbol} market details`}>
              <motion.div layoutId={`image-${card.symbol}-${id}`} className="stock-thumb-wrap">
                <img width={100} height={100} src={card.src} alt="" className="stock-thumb" />
              </motion.div>
              <span className="stock-copy">
                <motion.strong layoutId={`title-${card.symbol}-${id}`}>{card.symbol}</motion.strong>
                <motion.em layoutId={`description-${card.name}-${id}`}>{card.name}</motion.em>
              </span>
              <span className="stock-metrics"><b>{(card.collateralFactorBps / 100).toFixed(0)}% CF</b><em>{card.profile.marketCap}</em></span>
              <motion.span layoutId={`button-${card.symbol}-${id}`} className="stock-open">Details</motion.span>
            </button>
          </motion.li>
        ))}
      </ul>
    </>
  );
}

function Metric({ label, value, danger, blue }: { label: string; value: string; danger?: boolean; blue?: boolean }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><span className="block text-xs uppercase tracking-[.12em] text-[#a7a29a]">{label}</span><b className={danger ? "text-[#a64b4b] text-xl" : blue ? "text-[#6f7880] text-xl" : "text-[#9b8f7a] text-xl"}>{value}</b></div>;
}

export const CloseIcon = () => {
  return (
    <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.05 } }} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-black" aria-hidden="true">
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </motion.svg>
  );
};
