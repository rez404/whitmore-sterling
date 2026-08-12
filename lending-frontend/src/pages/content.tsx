import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardBody } from "@/src/components/ui/card";
import { Article, Callout, Stat, StatGrid } from "@/src/components/ui/misc";
import { Section } from "@/src/components/ui/table";
import { PageHeader } from "@/src/components/shell";
import type { DeskTab, PoolState } from "@/src/lib/chain";
import { explorer, short } from "@/src/lib/format";
import { LP_VAULTS, LP_ZAP, PLATFORM_TOKEN, STAKING_VAULT, UNISWAP_V3 } from "@/src/farms";
import { LENDING_POOL_ADDRESS, MARKETS, TREASURY_ADDRESS, USDG_ADDRESS } from "@/src/markets";

function Toc({ items }: { items: { href: string; label: string }[] }) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Sections">
      {items.map((i) => (
        <a
          key={i.href}
          href={i.href}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13.5px] text-ink-2 hover:border-line-strong hover:text-ink"
        >
          {i.label}
        </a>
      ))}
    </nav>
  );
}

/* ------------------------------ Documentation ------------------------------ */

export function DocumentationPage({ pool }: { pool: PoolState | null }) {
  const listedSymbols = MARKETS.map((m) => m.symbol).join(", ");
  const liveVaults = LP_VAULTS.filter((v) => v.vault);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Documentation"
        description="Every part of the protocol, end to end — the lending pool, the swap router, the LP vaults, the zap, and the staking vault."
      />

      <StatGrid>
        <Stat label="Lending pool" value={short(LENDING_POOL_ADDRESS)} />
        <Stat label="Debt asset" value="USDG · 6 dp" />
        <Stat label="Markets" value={`${MARKETS.length} listed`} />
        <Stat label="LP vaults live" value={`${liveVaults.length} of ${LP_VAULTS.length}`} />
      </StatGrid>

      <Toc
        items={[
          { href: "#docs-overview", label: "Overview" },
          { href: "#docs-assets", label: "Assets" },
          { href: "#docs-borrowing", label: "Borrowing" },
          { href: "#docs-liquidity", label: "Liquidity" },
          { href: "#docs-risk", label: "Risk engine" },
          { href: "#docs-oracles", label: "Price feeds" },
          { href: "#docs-interest", label: "Interest" },
          { href: "#docs-liquidations", label: "Liquidations" },
          { href: "#docs-fees", label: "Fees" },
          { href: "#docs-swap", label: "Swap" },
          { href: "#docs-vaults", label: "LP vaults" },
          { href: "#docs-zap", label: "Zap" },
          { href: "#docs-staking", label: "Staking" },
          { href: "#docs-addresses", label: "Addresses" },
        ]}
      />

      <Section title="Lending protocol">
      <div className="grid gap-4 lg:grid-cols-2">
        <Article id="docs-overview" eyebrow="01 · System model" title="What the protocol is" className="lg:col-span-2">
          <p>
            At its core the protocol has one lending pool contract, one USDG debt asset, and many listed stock-token
            collateral markets. The pool does not create pretend balances in the UI. Every balance, allowance, market
            parameter, oracle answer, debt amount, and liquidity value is read from Robinhood Chain through RPC.
          </p>
          <p>
            The system separates two roles. Borrowers deposit stock tokens and borrow USDG. Liquidity suppliers deposit
            USDG and receive internal pool shares representing a claim on supplied liquidity plus supplier interest.
            Both use the same pool, but collateral, debt, and liquidity-share accounting stay intentionally separate.
          </p>
          <ul>
            <li>Borrowers use tokenized stocks as collateral instead of selling them.</li>
            <li>Lenders supply USDG so borrowers can draw liquidity.</li>
            <li>Prices come from configured oracle feeds for each listed stock token.</li>
            <li>Risk parameters decide how much can be borrowed and when liquidation becomes possible.</li>
          </ul>
        </Article>

        <Article id="docs-assets" eyebrow="02 · Assets" title="Stock tokens, USDG, and decimals">
          <p>
            Supported collateral assets are tokenized equity exposure tokens such as {listedSymbols}. They are ERC-20
            tokens that can be approved, transferred, deposited, and withdrawn by smart contracts. They are economic
            exposure instruments — not shareholder voting rights or traditional brokerage custody.
          </p>
          <p>
            USDG is the pool's debt and liquidity asset. The live token uses 6 decimals, so USDG amounts are parsed with
            6 decimals while stock-token collateral is handled as 18-decimal units. Using the wrong decimals can make an
            approval look far larger than the amount typed.
          </p>
          <Callout title="Verify addresses">
            Always check token addresses before depositing. Every listed market links its token and the pool contract so
            you can inspect them in the block explorer.
          </Callout>
        </Article>

        <Article id="docs-borrowing" eyebrow="03 · Borrower lifecycle" title="Deposit collateral, then borrow USDG">
          <p>
            A borrower selects a listed stock token. The app reads the market configuration and oracle price, then the
            borrower approves the pool to move that collateral token. Once the approval confirms, the deposit transfers
            the stock token into the pool and records it under that wallet.
          </p>
          <p>
            Borrowing is a second transaction. The pool accrues interest, checks the market is listed, not paused, not
            frozen, and borrowable, checks the borrow cap and available liquidity, then updates debt before transferring
            USDG out. If the borrow would make the account unsafe, it reverts.
          </p>
          <ol>
            <li>Approve the stock token only if allowance is below the requested deposit.</li>
            <li>Deposit collateral into the pool.</li>
            <li>Borrow USDG up to the borrow limit, leaving a health buffer.</li>
            <li>Repay USDG later to reduce debt and unlock collateral.</li>
          </ol>
        </Article>

        <Article id="docs-liquidity" eyebrow="04 · Liquidity suppliers" title="Supplying USDG to fund borrowers">
          <p>
            Suppliers deposit USDG into the lending desk. The pool mints internal liquidity shares, not a separate
            wallet token. With no previous liquidity, shares start one-to-one with the supplied amount. After interest
            accrues, shares represent a proportional claim on total supplied liquidity.
          </p>
          <p>
            Withdrawals burn shares and return USDG if enough idle liquidity is available. If most liquidity has been
            borrowed, a supplier may need to wait for repayments, new liquidity, or accrued interest before withdrawing
            the desired amount.
          </p>
        </Article>

        <Article id="docs-risk" eyebrow="05 · Risk engine" title="Borrow limits, health factor, caps" className="lg:col-span-2">
          <p>
            Each market has its own collateral factor, liquidation threshold, liquidation bonus, max staleness window,
            borrow cap, and supply cap. The collateral factor sets normal borrowing capacity; the liquidation threshold
            sets when the account can be liquidated. Treat the borrow limit as a maximum, not a target.
          </p>
          <p>
            Health factor compares liquidation-limit collateral value against debt. Above 1.0 the account is above the
            liquidation line. Near 1.0 is dangerous — price movement, interest accrual, or an oracle update can push it
            over. The dashboard shows health factor so borrowers can add collateral or repay before that happens.
          </p>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 [&>div]:bg-surface [&>div]:p-4">
            <div>
              <p className="text-[14px] font-semibold text-ink">Collateral factor</p>
              <p className="mt-1 text-[13.5px] text-ink-3">How much value can be borrowed in normal conditions.</p>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-ink">Liquidation threshold</p>
              <p className="mt-1 text-[13.5px] text-ink-3">The line where liquidation can begin.</p>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-ink">Borrow cap</p>
              <p className="mt-1 text-[13.5px] text-ink-3">Maximum total debt allowed for a market.</p>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-ink">Staleness guard</p>
              <p className="mt-1 text-[13.5px] text-ink-3">Blocks unsafe operations when oracle data is too old.</p>
            </div>
          </div>
        </Article>

        <Article id="docs-oracles" eyebrow="06 · Price feeds" title="How stock-token value is calculated">
          <p>
            The pool uses AggregatorV3Interface-compatible feeds. On deposit, borrow, withdraw, or liquidation the
            contract reads the latest answer, checks it is positive, checks it is not stale, and normalises feed
            decimals into 18-decimal USD math.
          </p>
          <p>
            Stock-token markets can pause outside regular trading sessions or during oracle disruption. When a feed is
            stale or paused, blocking sensitive actions is safer than letting users borrow against invalid prices.
          </p>
        </Article>

        <Article id="docs-interest" eyebrow="07 · Interest model" title="Utilisation-driven borrowing cost">
          <p>
            Interest accrues when users interact with the pool. The contract measures elapsed time, computes utilisation
            as debt divided by cash plus debt, then applies a base rate plus a utilisation slope. Higher utilisation
            means scarcer liquidity, so the borrow APR rises.
          </p>
          <p>
            Accrued interest grows borrower debt through the borrow index. Part goes to suppliers by increasing total
            supplied liquidity, and a reserve portion is retained by the protocol — keeping supplier accounting
            share-based instead of updating every lender every block.
          </p>
        </Article>

        <Article
          id="docs-liquidations"
          eyebrow="08 · Liquidations"
          title="What happens when a position becomes unsafe"
          className="lg:col-span-2"
        >
          <p>
            If health factor drops below the minimum, a liquidator can repay part of the borrower's USDG debt and
            receive discounted collateral. The flow repays debt, seizes collateral based on price and bonus settings,
            sends a portion of the bonus collateral to the treasury, and leaves the borrower closer to the target health
            factor where possible.
          </p>
          <p>
            The design includes close-factor logic, target-health-factor sizing, dust protection, and deficit reporting.
            If collateral is exhausted and debt remains, the protocol records a deficit so bad debt is explicit rather
            than silently hidden.
          </p>
          <Callout title="Do not wait for a warning" tone="warn">
            If health factor approaches 1.0, repay USDG or deposit more collateral. Liquidation bots act before
            interfaces do.
          </Callout>
        </Article>

        <Article id="docs-fees" eyebrow="09 · Fees and reserves" title="Where value moves">
          <p>
            Borrowers pay a 0.25% origination fee. Borrow interest splits between suppliers and protocol reserves via
            the reserve factor. Liquidations include a protocol fee taken from the liquidation bonus collateral — not an
            extra USDG charge on top of the repay amount.
          </p>
          <ul>
            <li>Origination fee: 25 bps on newly borrowed USDG.</li>
            <li>Reserve factor: 20% of accrued interest to protocol reserves.</li>
            <li>Protocol liquidation fee: 20% of liquidation bonus collateral.</li>
            <li>Base rate plus utilisation slope determines the live borrow APR.</li>
          </ul>
        </Article>

        <Article id="docs-ux" eyebrow="10 · Transaction flow" title="Why some actions need two prompts">
          <p>
            ERC-20 tokens require approval before another contract can move them. That is why depositing collateral,
            repaying, and supplying USDG can involve an approval transaction followed by the pool transaction. The app
            checks current allowance first and skips approval when it is already sufficient.
          </p>
          <p>
            Treat a transaction as final only after confirmation. If a wallet prompt is rejected, the app does not
            submit the next transaction. If a transaction confirms but the UI looks stale, reload — the chain is the
            source of truth.
          </p>
        </Article>

        <Article eyebrow="11 · Admin controls" title="Market operations">
          <p>
            The owner can list markets, update market flags, pause the pool, update risk parameters and the target
            health factor, and change treasury. These controls exist because lending markets must react to bad feeds,
            frozen assets, and changing liquidity.
          </p>
          <p>
            Production operation should use a multisig and a public change process rather than a single hot wallet.
          </p>
        </Article>

        <Article eyebrow="12 · Worked example" title="How to think about a position">
          <p>
            Deposit a stock token worth $1,000 at a 45% collateral factor and the borrow limit is about $450. Borrowing
            the full limit leaves no room for price drops. Borrowing $200–$300 creates cushion, especially for volatile
            markets or after-hours gaps.
          </p>
          <p>
            Falling collateral price lowers health factor. Accruing interest raises debt and also lowers it. Repaying
            lowers debt; depositing more collateral raises the buffer; withdrawing collateral removes buffer and is
            blocked if it would make the account unsafe.
          </p>
        </Article>
      </div>
      </Section>

      <Section title="Trading, farms and staking">
      <div className="grid gap-4 lg:grid-cols-2">
        <Article id="docs-swap" eyebrow="13 · Swap" title="Routing trades through Uniswap V3" className="lg:col-span-2">
          <p>
            The Swap page trades directly against Uniswap V3 pools on this chain. There is no aggregator, no relayer and
            no off-chain order book: the interface asks the on-chain quoter for prices and your wallet signs a call to
            the Uniswap router. Sushi is not used — its factory has no pools on this chain, and every tokenized-equity
            pair with real depth is on Uniswap.
          </p>
          <p>
            Quoting tries all three fee tiers — 0.05%, 0.30% and 1.00% — for the direct pair and keeps whichever returns
            the most output. Only when no direct pool has depth does it fall back to two-hop routes through WETH or
            USDG. Native ETH is accepted as an input and wrapped by the router; you never have to wrap it yourself. The
            deployed router is the original SwapRouter, so each call carries an explicit deadline alongside the
            minimum-output amount.
          </p>
          <ul>
            <li>Quotes come from QuoterV2 by simulation, not from a cached price.</li>
            <li>Slippage is capped at 1%; the minimum output is enforced by the router, not by the interface.</li>
            <li>Price impact is shown before you sign, and flagged above 1%.</li>
            <li>The oracle price shown alongside is the lending pool's risk feed, not the price you trade at.</li>
          </ul>
          <Callout title="Why the two prices differ">
            The oracle is a Chainlink-style feed used to value collateral. The DEX price is whatever the pool's current
            reserves imply. Outside market hours these drift apart, sometimes sharply. Neither is wrong; they measure
            different things.
          </Callout>
        </Article>

        <Article id="docs-vaults" eyebrow="14 · LP vaults" title="StockLpVault: one pair, one position, ERC-20 shares">
          <p>
            Each farm is an instance of <b className="font-medium text-ink">StockLpVault</b>, deployed once per pair. The
            vault owns a single Uniswap V3 position covering the full price range, minted through the canonical position
            manager. Depositors receive ERC-20 shares proportional to the liquidity their deposit added, so the share
            supply tracks the position rather than a book of individual NFTs.
          </p>
          <p>
            Both <code>deposit</code> and <code>withdraw</code> compound before they do anything else: the vault collects
            the position's outstanding fees, takes the performance fee from what was collected, and reinvests the
            remainder into the position. That ordering is what makes an external keeper optional — an idle vault defers
            compounding, it does not lose the fees.
          </p>
          <ul>
            <li>Performance fee: 10% of collected fees. The principal is never charged, on the way in or out.</li>
            <li>Full range means the position is never out of range and never needs repositioning.</li>
            <li>It also earns less than a concentrated position would — the trade-off is that it needs no management.</li>
            <li>Withdrawals are partial or complete, with no lock-up and no exit penalty.</li>
          </ul>
          <Callout title="Fee tiers differ per vault" tone="warn">
            The pairs are not all on the same tier — some are 0.05%, some 0.30%, one is 1.00%. The interface reads
            <code> fee()</code> from each vault rather than assuming a default, because the tier feeds the slippage
            bounds on every deposit and withdrawal.
          </Callout>
        </Article>

        <Article id="docs-zap" eyebrow="15 · Zap" title="LpZap: entering a pair from a single asset">
          <p>
            <b className="font-medium text-ink">LpZap</b> turns one asset into a balanced vault deposit in a single
            transaction. It takes the input, executes a list of swap legs against the Uniswap router, deposits the
            resulting pair into the vault, and forwards the shares to you.
          </p>
          <p>
            The legs are supplied by the caller, so the contract validates them rather than trusting them: every leg's
            output must be one of the two pair tokens, and the legs together cannot spend more than the amount sent in.
            After the deposit, every leftover balance — both pair tokens and any unspent input — is swept back to the
            caller, so nothing can be stranded in the contract.
          </p>
          <ul>
            <li>Accepts native ETH or an ERC-20 input.</li>
            <li>Balances are credited by measured delta, so fee-on-transfer tokens cannot break the accounting.</li>
            <li>Slippage floors are derived from the pool's current price, not passed in as zero.</li>
          </ul>
        </Article>

        <Article id="docs-staking" eyebrow="16 · Staking" title="MultiRewardStaking: one stake, many reward streams" className="lg:col-span-2">
          <p>
            The staking vault takes a single asset — the platform token — and pays out an arbitrary number of partner
            reward tokens simultaneously. Accounting follows the Synthetix MultiRewards pattern: each reward token has
            its own <code>rewardPerTokenStored</code> index, so adding a new partner does not require existing stakers to
            unstake, restake, or claim first.
          </p>
          <p>
            Streams are funded, never minted. A partner transfers tokens in and calls <code>notifyRewardAmount</code>,
            which measures the balance actually received — not the amount requested — so a token that burns on transfer
            cannot desynchronise the schedule from the balance. The reward then pays out linearly over the stream's
            duration.
          </p>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 [&>div]:bg-surface [&>div]:p-4">
            {[
              ["Exit penalty", "10% of the amount unstaked, hard-capped in the contract at 10%."],
              ["Where it goes", "Redistributed to the stakers who stay, as a claimable balance of the staking token."],
              ["Owner powers", "The rate can only be lowered, never raised above the cap it launched at."],
              ["Lock-up", "None. Rewards already earned stay claimable whether you stay or leave."],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="text-[14px] font-semibold text-ink">{t}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{d}</p>
              </div>
            ))}
          </div>
          <p>
            The penalty is distributed through a separate index for the staking token itself, and the leaver's own
            snapshot is advanced in the same transaction — so a departing staker cannot claim a share of the penalty they
            just paid. If the last staker exits, there is no one to distribute to and the penalty goes to the fee
            recipient instead.
          </p>
          <Callout title="Not deployed" tone="warn">
            The platform token and the staking vault are written and tested but not yet on chain. The Stake page reads
            its addresses from a single config file and goes live the moment they are filled in.
          </Callout>
        </Article>
      </div>
      </Section>

      <Section id="docs-addresses" title="Deployed contracts" meta="Robinhood Chain · 4663">
        <div className="grid gap-4 lg:grid-cols-2">
          <AddressTable
            title="Core"
            rows={[
              ["Lending pool", LENDING_POOL_ADDRESS],
              ["USDG", USDG_ADDRESS],
              ["Treasury", pool?.treasury || TREASURY_ADDRESS],
              ["LpZap", LP_ZAP],
              ["Uniswap factory", UNISWAP_V3.factory],
              ["Position manager", UNISWAP_V3.positionManager],
              ["WETH9", UNISWAP_V3.weth9],
              ["Platform token", PLATFORM_TOKEN],
              ["Staking vault", STAKING_VAULT],
            ]}
          />
          <AddressTable
            title="LP vaults"
            rows={liveVaults.map((v) => [`${v.symbol} / USDG`, v.vault] as [string, string])}
            footer={`The remaining ${LP_VAULTS.length - liveVaults.length} listed pairs trade on Uniswap but have no vault yet. They are listed on the Farms page under Other pools.`}
          />
        </div>
      </Section>
    </div>
  );
}

/** Contract directory. An unfilled address is shown as pending, never as blank. */
function AddressTable({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: [string, string][];
  footer?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <p className="border-b border-line bg-surface-2 px-4 py-2.5 text-[12.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
        {title}
      </p>
      <dl className="divide-y divide-[var(--color-line)]">
        {rows.map(([label, address]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
            <dt className="truncate text-[14px] text-ink-2">{label}</dt>
            <dd className="shrink-0 font-mono text-[13px]">
              {address ? (
                <a
                  href={explorer(address, "address")}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-3 transition-colors hover:text-accent"
                >
                  {short(address)}
                </a>
              ) : (
                <span className="font-sans text-[13.5px] text-ink-4">Not deployed</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {footer && (
        <p className="border-t border-line px-4 py-3 text-[13px] leading-relaxed text-ink-4">{footer}</p>
      )}
    </div>
  );
}

/* ---------------------------------- Learn --------------------------------- */

export function LearnPage({ go }: { go: (tab: DeskTab) => void }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Learn"
        description="Two ways to use the same wallet: borrow against what you hold, or put it to work earning fees. Start here."
      />

      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 [&>div]:bg-surface [&>div]:p-5">
        {[
          { n: "01", t: "ETH", d: "Native gas asset for Robinhood Chain. You need it for approvals, deposits, borrows, repays, and withdrawals." },
          { n: "02", t: "USDG", d: "The debt, liquidity and quote asset. Borrowers receive USDG, suppliers deposit it, every pool is priced in it. 6 decimals." },
          { n: "03", t: "Stock tokens", d: "Tokenized equity and ETF exposure. Collateral for the lending pool and one side of every farm pair. 18 decimals." },
          { n: "04", t: "Health factor", d: "The safety score of a borrow. Above 1.0 you are above the liquidation line; below it, anyone can liquidate you." },
          { n: "05", t: "LP position", d: "Liquidity you place in a trading pool. Traders swap against it and pay you a fee on every trade." },
          { n: "06", t: "Vault share", d: "What a farm deposit gives you back — an ERC-20 claim on a slice of the vault's pool position and the fees it has collected." },
          { n: "07", t: "Fee APR", d: "The last 24 hours of pool fees, annualised. A snapshot of a moving number, not a promised rate." },
          { n: "08", t: "Impermanent loss", d: "The cost of providing liquidity: when a price moves, you end up holding more of the side that fell." },
        ].map((c) => (
          <div key={c.n}>
            <p className="text-[12px] font-semibold tracking-[0.14em] text-ink-4 uppercase">{c.n}</p>
            <p className="mt-2 text-[15px] font-semibold text-ink">{c.t}</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">{c.d}</p>
          </div>
        ))}
      </div>

      <Toc
        items={[
          { href: "#learn-tokenized", label: "Tokenized stocks" },
          { href: "#learn-eth", label: "ETH / WETH" },
          { href: "#learn-lending", label: "Why borrow" },
          { href: "#learn-health", label: "Health factor" },
          { href: "#learn-flow", label: "Borrower flow" },
          { href: "#learn-farming", label: "Farming" },
          { href: "#learn-vault", label: "How the vault works" },
          { href: "#learn-il", label: "Impermanent loss" },
          { href: "#learn-zap", label: "One-token entry" },
          { href: "#learn-exit", label: "Getting your money out" },
          { href: "#learn-staking", label: "Staking" },
          { href: "#learn-risks", label: "Risks" },
        ]}
      />

      <Section title="Part one · Borrowing against what you hold">
      <div className="grid gap-4 lg:grid-cols-2">
        <Article id="learn-tokenized" eyebrow="01 · Foundation" title="What tokenized stocks are" className="lg:col-span-2">
          <p>
            Tokenized stocks are blockchain tokens designed to represent economic exposure to public companies, ETFs, or
            similar instruments. Instead of living only inside a brokerage database, the exposure moves through wallet
            transactions and interacts with smart contracts.
          </p>
          <p>
            This does not mean shareholder rights, voting rights, direct ownership of the underlying security, or
            traditional brokerage protections. The practical model is simpler: a transferable token whose price is meant
            to follow a real-world market reference.
          </p>
          <p>
            Because the token is wallet-native, a user can hold equities, ETFs, ETH, and stablecoins in the same onchain
            environment — which makes collateral, liquidity, settlement, and account health programmable.
          </p>
        </Article>

        <Article id="learn-eth" eyebrow="02 · ETH on this chain" title="Where ETH fits">
          <p>
            ETH pays network fees. WETH is its ERC-20 form. Stock tokens are what this pool accepts as collateral. USDG
            is what the pool lends and receives.
          </p>
          <p>
            Explaining ETH here does not make ETH collateral. For that, the pool would need a listed WETH market, a
            verified price feed, configured risk parameters, and contract state recognising WETH as listed.
          </p>
          <Callout title="Practical rule" tone="warn">
            Keep a small ETH balance for gas. Do not assume native ETH can be deposited as ERC-20 collateral unless the
            contract supports wrapping or a listed WETH market exists.
          </Callout>
        </Article>

        <Article id="learn-lending" eyebrow="03 · Why lending exists" title="Why borrow instead of sell?">
          <p>
            Selling turns an asset into cash but ends the position. Borrowing lets a holder keep exposure while
            unlocking liquidity. If you believe an asset is worth holding but temporarily need spendable liquidity,
            collateralized lending is the alternative to selling.
          </p>
          <p>
            The cost is risk. A loan carries interest, collateral can fall, and an unsafe position can be liquidated.
            The correct framing is not free money — it is controlled leverage against an asset you want to keep.
          </p>
        </Article>

        <Article id="learn-health" eyebrow="04 · Health factor" title="The number that matters most">
          <p>
            Health factor is the safety score of a borrowing position, comparing liquidation-limit collateral value
            against debt. Above 1.0 the account is above the liquidation line; below 1.0 it can be liquidated.
          </p>
          <ul>
            <li>Health improves when you repay debt.</li>
            <li>Health improves when you add collateral.</li>
            <li>Health worsens when collateral price falls.</li>
            <li>Health worsens as interest increases debt.</li>
            <li>Health worsens when you withdraw collateral.</li>
          </ul>
        </Article>

        <Article eyebrow="05 · Allowances" title="Why approvals appear before actions">
          <p>
            ERC-20 assets cannot be pulled by a pool until the wallet grants allowance. Approval is permission — deposit,
            repay, and supply can each require one before the pool transaction.
          </p>
          <p>
            The app checks fresh onchain allowance first. If a wallet keeps asking for approval, the usual causes are
            wrong decimals, the wrong token, the wrong spender, rejected transactions, or stale wallet state.
          </p>
        </Article>

        <Article id="learn-flow" eyebrow="06 · Borrower flow" title="From holding a stock token to borrowing USDG" className="lg:col-span-2">
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 [&>div]:bg-surface [&>div]:p-4">
            {[
              ["1. Acquire the asset", "Buy or receive a supported stock token and verify the address."],
              ["2. Keep ETH for gas", "Every approval, deposit, borrow, repay, and withdrawal costs a fee."],
              ["3. Approve collateral", "The approval lets the pool move the exact token you selected."],
              ["4. Deposit collateral", "The pool records your posted balance under your wallet."],
              ["5. Borrow conservatively", "Take less than the maximum so price moves do not threaten the account."],
              ["6. Monitor health", "Watch health factor, debt, price, liquidity, and oracle freshness."],
              ["7. Repay USDG", "Repayment lowers debt and improves health."],
              ["8. Withdraw collateral", "Once debt is repaid or reduced, withdraw the stock token."],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="text-[14px] font-semibold text-ink">{t}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{d}</p>
              </div>
            ))}
          </div>
        </Article>
      </div>
      </Section>

      <Section title="Part two · Earning on what you hold">
      <div className="grid gap-4 lg:grid-cols-2">
        <Article
          id="learn-farming"
          eyebrow="01 · Farming"
          title="What providing liquidity actually is"
          className="lg:col-span-2"
        >
          <p>
            Every swap on this chain trades against a pool — a pile of two tokens sitting in a contract. Someone has to
            put those two tokens there. That someone is a liquidity provider, and in exchange for lending the pool
            inventory they collect a cut of every trade that passes through it.
          </p>
          <p>
            So a farm position is not a deposit that pays interest. You are the counterparty on the other side of other
            people's trades. When someone buys NVDA from the NVDA / USDG pool, they hand USDG to the pool and take NVDA
            out — and pay the pool's fee, which is split among everyone who supplied it.
          </p>
          <ul>
            <li>You supply both sides of a pair, for example NVDA and USDG.</li>
            <li>Traders swap through the pool and pay a fee — 0.05%, 0.30% or 1.00%, depending on the pair.</li>
            <li>Your share of those fees accrues to your position, in proportion to how much of the pool is yours.</li>
            <li>You can take the position back, plus the fees it earned, whenever you like.</li>
          </ul>
          <Callout title="The fee is the whole product">
            Nothing is minted, no yield is promised, and no one pays you out of a treasury. The entire return is a share
            of the fees real traders paid. If the pool goes quiet, the return goes to zero — it does not go negative from
            the fee side, but see impermanent loss below.
          </Callout>
        </Article>

        <Article id="learn-vault" eyebrow="02 · Vaults" title="What the vault does for you">
          <p>
            Providing liquidity on Uniswap V3 by hand means minting an NFT position, choosing a price range, and coming
            back regularly to collect fees and put them back to work. The vault does all of that for you and gives you a
            plain ERC-20 share instead.
          </p>
          <p>
            The vault holds one position covering the full price range, so it never falls out of range and never has to
            be repositioned. Every time anyone deposits or withdraws, the vault first collects the outstanding fees and
            folds them back into the position — which is why your share is worth a little more each time the pool trades.
          </p>
          <ul>
            <li>Deposit either both tokens or a single one; you get shares back.</li>
            <li>Fees compound into the position automatically. There is nothing to claim.</li>
            <li>The platform keeps 10% of the fees earned. Your deposit itself is never charged.</li>
            <li>Withdraw any percentage at any time — no lock, no exit fee on farms.</li>
          </ul>
        </Article>

        <Article id="learn-apr" eyebrow="03 · Reading the number" title="What the fee APR does and does not mean">
          <p>
            The APR on each pair is the last 24 hours of trading volume, multiplied by the pool's fee tier, annualised,
            and divided by the pool's liquidity. It is arithmetic on a real, observed number — not a projection.
          </p>
          <p>
            Two things make it optimistic. Volume is volatile: one busy day can make a quiet pair look spectacular. And
            the figure describes the whole pool, where concentrated positions do most of the work — a full-range position
            like the vault's earns a fraction of it, because its liquidity is spread across every price instead of piled
            where trading happens.
          </p>
          <Callout title="Treat it as a ranking, not a rate" tone="warn">
            The APR column is good for telling you which pair is busy. It is not a rate you should expect to receive.
          </Callout>
        </Article>

        <Article
          id="learn-il"
          eyebrow="04 · The real risk"
          title="Impermanent loss, with actual numbers"
          className="lg:col-span-2"
        >
          <p>
            A pool always rebalances against you. When the price of a stock token rises, traders buy it out of the pool
            and leave USDG behind — so you end up holding less of the asset that went up and more of the one that did
            not. When it falls, the reverse. Compared with simply holding both tokens in your wallet, you are always
            slightly behind. That gap is impermanent loss.
          </p>
          <p>
            It is called impermanent because it closes if the price returns to where you entered. It becomes permanent
            the moment you withdraw at a different price.
          </p>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 [&>div]:bg-surface [&>div]:p-4">
            {[
              ["Price +25%", "≈ 0.6% behind holding", "Fees usually cover this."],
              ["Price +100%", "≈ 5.7% behind holding", "Needs a busy pool to be worth it."],
              ["Price +300%", "≈ 20% behind holding", "Fees rarely cover a move this size."],
            ].map(([t, d, n]) => (
              <div key={t}>
                <p className="text-[14px] font-semibold text-ink">{t}</p>
                <p className="mt-1 text-[13.5px] text-ink-2">{d}</p>
                <p className="mt-1 text-[13px] text-ink-4">{n}</p>
              </div>
            ))}
          </div>
          <p>
            The practical rule: farming pays when a pair trades a lot and moves a little. If you have a strong directional
            view on a stock, holding it is the cleaner expression of that view.
          </p>
        </Article>

        <Article id="learn-zap" eyebrow="05 · One-token entry" title="Depositing without owning both sides">
          <p>
            A pool needs both tokens, but you rarely hold both in the right proportion. The zap solves that in a single
            transaction: it takes the one asset you have, swaps the right amount of it into the other side at the current
            price, and deposits the pair into the vault.
          </p>
          <p>
            Two consequences worth knowing. You pay a swap fee and a little price impact on the half that gets converted,
            so a zap costs marginally more than arriving with a balanced pair. And whatever the position could not use
            comes straight back to your wallet in the same transaction — nothing is left stranded in the contract.
          </p>
        </Article>

        <Article id="learn-exit" eyebrow="06 · Exiting" title="Where your position lives and how to leave">
          <p>
            Once you deposit, the pair appears under <b className="font-medium text-ink">Your positions</b> at the top of
            the Farms page. Open it and the detail page shows your shares, your percentage of the vault, and what those
            shares are worth right now.
          </p>
          <p>
            That withdrawable figure is not an estimate. The page simulates the actual withdrawal against the contract
            with your address, so the two numbers shown are exactly what you would receive if you signed. Pick 25, 50, 75
            or 100% and confirm; the vault collects the position's outstanding fees first, so your share of them leaves
            with the principal.
          </p>
        </Article>

        <Article id="learn-staking" eyebrow="07 · Staking" title="Staking STERLING for partner rewards" className="lg:col-span-2">
          <p>
            The Stake page is a different mechanism from farming. You deposit one token — STERLING, the platform token —
            and earn several partner tokens at once. Partners fund a reward stream that pays out over a fixed period;
            nothing is minted to pay you, so the rewards are only ever as large as what a partner actually deposited.
          </p>
          <p>
            There is no lock-up, but leaving early has a price: a portion of whatever you unstake is handed to the
            stakers who stay, capped at 10%. It exists so that people who hold through a full reward period are paid for
            it by the people who do not. Rewards already earned stay claimable either way.
          </p>
          <Callout title="Not live yet" tone="warn">
            The staking vault and the platform token are written and tested but not deployed. The page stays honest about
            that rather than advertising a yield that does not exist.
          </Callout>
        </Article>
      </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Article id="learn-risks" eyebrow="Before you sign" title="What to understand" className="lg:col-span-2">
          <p>
            Tokenized assets make markets programmable but do not remove risk. Lending adds smart contract risk, oracle
            risk, liquidation risk, liquidity risk, market-hours risk, issuer risk, wallet risk, and user error. Farming
            adds impermanent loss and custody of your deposit by an unaudited contract. A polished interface does not
            guarantee a safe position.
          </p>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 [&>div]:bg-surface [&>div]:p-4">
            {[
              ["Liquidation risk", "Collateral can be seized if debt grows too large relative to its value."],
              ["Oracle risk", "Bad, stale, paused, or delayed prices can block actions or shift risk fast."],
              ["Liquidity risk", "Borrowing needs supplied USDG. Withdrawals need idle liquidity."],
              ["Market gap risk", "Stock-token prices can move sharply around opens, closes, and news."],
              ["Smart contract risk", "Code can contain bugs even when carefully designed. The vaults are unaudited."],
              ["Approval risk", "Approving the wrong spender or token can expose funds. Verify addresses."],
              ["Impermanent loss", "A farm position underperforms simply holding when the price moves far."],
              ["Custody risk", "A vault deposit is held by the vault contract, not by your wallet."],
              ["Admin risk", "Vault owner and fee recipient are a single key until they move to a multisig."],
            ].map(([t, d]) => (
              <div key={t}>
                <p className="text-[14px] font-semibold text-ink">{t}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink-3">{d}</p>
              </div>
            ))}
          </div>
        </Article>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => go("farms")}>
          Explore farms
        </Button>
        <Button variant="outline" onClick={() => go("borrow")}>
          Start with collateral
        </Button>
        <Button variant="outline" onClick={() => go("lending")}>
          Supply USDG liquidity
        </Button>
        <Button variant="ghost" onClick={() => go("documentation")}>
          Read protocol docs
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------- Suits --------------------------------- */

const SUITS_URL = "https://opensea.io/collection/suitsonchain/overview";

export function SuitsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Suits"
        description="An identity marker for discipline, self-mastery, and the decision to become the best version of yourself."
        action={
          <Button variant="outline" size="sm" onClick={() => window.open(SUITS_URL, "_blank", "noreferrer")}>
            OpenSea <ExternalLink />
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <img
            src="/suits-manifesto.png"
            alt="Suits NFT character portrait"
            className="aspect-[4/5] w-full object-cover object-top"
          />
        </Card>
        <Card>
          <CardBody className="space-y-4 text-[14.5px] leading-relaxed text-ink-2">
            <p>
              The Suits NFT collection represents more than digital artwork — it symbolizes a commitment to
              self-development, discipline, and personal evolution. A suit has long been associated with
              professionalism, confidence, and purpose. Within this collection, wearing the suit is not about status or
              wealth; it is about making the conscious decision to become the best version of yourself. Each piece
              represents the mindset that growth is earned through consistency, accountability, and the courage to
              continually improve.
            </p>
            <p>
              The ideology of the Suit is rooted in the belief that success begins with identity. When someone "puts on
              the suit," they are choosing to think differently, act intentionally, and carry themselves with integrity
              regardless of their circumstances. The suit becomes a daily reminder that excellence is built through
              preparation, resilience, lifelong learning, and the willingness to lead by example. It represents a
              standard set internally rather than one defined by the opinions of others.
            </p>
            <p>
              As an NFT collection, Suits creates a community united by ambition rather than appearance. Every holder
              becomes part of a movement that values self-mastery, meaningful relationships, and leaving a positive
              impact on the world. The artwork serves as a symbol of this shared philosophy — a visual reminder that the
              most valuable investment anyone can make is in themselves.
            </p>
            <div className="pt-1">
              <a
                href={SUITS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-2.5 text-[14px] font-medium text-ink hover:bg-surface-2"
              >
                View collection on OpenSea <ExternalLink className="size-3.5" />
              </a>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
