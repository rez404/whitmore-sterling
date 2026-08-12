import * as React from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardBody } from "@/src/components/ui/card";
import { Article, Callout, Stat, StatGrid } from "@/src/components/ui/misc";
import { PageHeader } from "@/src/components/shell";
import type { DeskTab, PoolState } from "@/src/lib/chain";
import { pct, short } from "@/src/lib/format";
import { LENDING_POOL_ADDRESS, MARKETS, TREASURY_ADDRESS } from "@/src/markets";

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
  return (
    <div className="space-y-5">
      <PageHeader
        title="Documentation"
        description="How the protocol works, end to end — assets, borrowing, liquidity, risk, liquidations, and fees."
      />

      <StatGrid>
        <Stat label="Pool" value={short(LENDING_POOL_ADDRESS)} />
        <Stat label="Debt asset" value="USDG · 6 dp" />
        <Stat label="Markets" value={`${MARKETS.length} listed`} />
        <Stat label="Borrow APR" value={pool ? pct(pool.borrowAprBps) : "—"} />
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
          { href: "#docs-ux", label: "Transactions" },
        ]}
      />

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

      <StatGrid>
        <Stat label="Pool" value={short(LENDING_POOL_ADDRESS)} />
        <Stat label="Treasury" value={short(pool?.treasury || TREASURY_ADDRESS)} />
        <Stat label="Markets" value={`${MARKETS.length}`} />
        <Stat label="Borrow APR" value={pool ? pct(pool.borrowAprBps) : "—"} />
      </StatGrid>
    </div>
  );
}

/* ---------------------------------- Learn --------------------------------- */

export function LearnPage({ go }: { go: (tab: DeskTab) => void }) {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Learn"
        description="Keep the asset, use the value. How tokenized stocks, collateral, and health factor fit together."
      />

      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 [&>div]:bg-surface [&>div]:p-5">
        {[
          { n: "01", t: "ETH", d: "Native gas asset for Robinhood Chain. You need it for approvals, deposits, borrows, repays, and withdrawals." },
          { n: "02", t: "WETH", d: "Wrapped ETH — the ERC-20 form that smart contracts can move. Verified here at 0x0Bd7…AD73, 18 decimals." },
          { n: "03", t: "Stock tokens", d: "The collateral assets for this pool. They track equity or ETF exposure and can be posted when the market is listed and the oracle is live." },
          { n: "04", t: "USDG", d: "The debt and liquidity asset. Borrowers receive USDG, suppliers deposit it. 6 decimals, unlike 18-decimal stock tokens." },
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
          { href: "#learn-risks", label: "Risks" },
        ]}
      />

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

        <Article id="learn-risks" eyebrow="07 · Risks" title="What to understand before signing" className="lg:col-span-2">
          <p>
            Tokenized assets make markets programmable but do not remove risk. Lending adds smart contract risk, oracle
            risk, liquidation risk, liquidity risk, market-hours risk, issuer risk, wallet risk, and user error. A
            polished interface does not guarantee a safe position.
          </p>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 [&>div]:bg-surface [&>div]:p-4">
            {[
              ["Liquidation risk", "Collateral can be seized if debt grows too large relative to its value."],
              ["Oracle risk", "Bad, stale, paused, or delayed prices can block actions or shift risk fast."],
              ["Liquidity risk", "Borrowing needs supplied USDG. Withdrawals need idle liquidity."],
              ["Market gap risk", "Stock-token prices can move sharply around opens, closes, and news."],
              ["Smart contract risk", "Code can contain bugs even when carefully designed."],
              ["Approval risk", "Approving the wrong spender or token can expose funds. Verify addresses."],
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
        <Button variant="primary" onClick={() => go("borrow")}>
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
