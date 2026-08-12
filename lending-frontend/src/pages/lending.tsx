import { Button } from "@/src/components/ui/button";
import { Alert, AmountInput } from "@/src/components/ui/misc";
import { Money } from "@/src/components/ui/figure";
import { Figure, FigureRow, Section } from "@/src/components/ui/table";
import { TokenIcon } from "@/src/components/ui/token";
import { PageHeader } from "@/src/components/shell";
import type { AccountState, PoolState, TxKind } from "@/src/lib/chain";
import { amt, num, pct, positiveDelta, short } from "@/src/lib/format";
import { TREASURY_ADDRESS } from "@/src/markets";

export function LendingPage({
  pool,
  accountState,
  debtDecimals,
  form,
  setAmount,
  action,
  account,
  pending,
}: {
  pool: PoolState | null;
  accountState: AccountState | null;
  debtDecimals: number;
  form: Record<TxKind, string>;
  setAmount: (kind: TxKind, value: string) => void;
  action: (kind: TxKind) => Promise<void>;
  account: string;
  pending: string;
  connect: () => void;
}) {
  const utilization =
    pool && pool.totalSuppliedLiquidity > 0n
      ? Number((pool.totalDebt * 10000n) / pool.totalSuppliedLiquidity) / 100
      : 0;
  const depositInterest = accountState
    ? positiveDelta(accountState.withdrawableLiquidity, accountState.suppliedLiquidity)
    : 0n;
  const ethInterest = accountState
    ? positiveDelta(accountState.ethWithdrawableLiquidity, accountState.suppliedEthLiquidity)
    : 0n;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Lend"
        description="Supply USDG so borrowers can draw against their collateral. You earn a share of borrow interest, set by utilisation."
      />

      <FigureRow>
        <Figure label="Available liquidity" size="lg" value={<Money value={num(pool?.liquidity, debtDecimals)} compact />} />
        <Figure label="Total supplied" value={<Money value={num(pool?.totalSuppliedLiquidity, debtDecimals)} compact />} />
        <Figure label="Utilisation" value={`${utilization.toFixed(2)}%`} hint="Debt ÷ supplied" />
        <Figure label="Borrow APR" value={pool ? pct(pool.borrowAprBps) : "—"} hint="Base + utilisation slope" />
      </FigureRow>

      {pool?.liquidity === 0n && (
        <Alert tone="warn" title="No liquidity in the pool">
          Borrowing stays disabled until suppliers deposit USDG.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section
          title={
            <span className="flex items-center gap-2.5">
              <TokenIcon symbol="USDG" size="md" /> USDG
            </span>
          }
          meta="Earns borrow interest"
        >
          <div className="grid grid-cols-2 gap-x-10 gap-y-5 pb-2">
            <Figure
              label="Your supplied"
              value={account ? <Money value={num(accountState?.withdrawableLiquidity, debtDecimals)} compact /> : "—"}
              hint="Withdrawable claim"
            />
            <Figure
              label="Interest earned"
              value={account ? <Money value={num(depositInterest, debtDecimals)} decimals={6} compact /> : "—"}
              hint="Growth in share value"
              tone={depositInterest > 0n ? "good" : undefined}
            />
          </div>
          <Field
            label="Supply"
            value={form.supply}
            onChange={(v) => setAmount("supply", v)}
            unit="USDG"
            button="Supply"
            variant="primary"
            onSubmit={() => action("supply")}
            disabled={!!pending || !account}
          />
          <Field
            label="Withdraw"
            value={form.withdrawLiquidity}
            onChange={(v) => setAmount("withdrawLiquidity", v)}
            unit="USDG"
            button="Withdraw"
            onSubmit={() => action("withdrawLiquidity")}
            disabled={!!pending || !account}
            hint="Withdrawals need idle liquidity — if utilisation is high you may have to wait for repayments."
          />
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2.5">
              <TokenIcon symbol="ETH" size="md" /> Native ETH
            </span>
          }
          meta={pool && !pool.ethSupported ? "Not enabled on this deployment" : "No approval needed"}
        >
          {pool && !pool.ethSupported ? (
            <Alert tone="info" title="Contract upgrade pending">
              The interface supports native ETH supply and withdrawal, but the deployed pool does not expose those
              functions yet.
            </Alert>
          ) : (
            <Alert tone="info" title="No ETH yield source yet">
              ETH deposits are tracked as shares, but nothing accrues to the ETH side until an ETH-side yield mechanism
              is enabled. Shares stay 1:1 until then.
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-x-10 gap-y-5 py-2">
            <Figure
              label="Your supplied"
              value={account ? `${amt(accountState?.ethWithdrawableLiquidity)} ETH` : "—"}
            />
            <Figure label="Interest earned" value={account ? `${amt(ethInterest, 8)} ETH` : "—"} />
          </div>
          <Field
            label="Supply"
            value={form.supplyEth}
            onChange={(v) => setAmount("supplyEth", v)}
            unit="ETH"
            button="Supply"
            onSubmit={() => action("supplyEth")}
            disabled={!!pending || !account || !pool?.ethSupported}
          />
          <Field
            label="Withdraw"
            value={form.withdrawEth}
            onChange={(v) => setAmount("withdrawEth", v)}
            unit="ETH"
            button="Withdraw"
            onSubmit={() => action("withdrawEth")}
            disabled={!!pending || !account || !pool?.ethSupported}
          />
        </Section>
      </div>

      <Section title="Reserves" meta="Protocol-retained interest">
        <FigureRow className="border-t-0 pt-1">
          <Figure label="Protocol reserves" value={<Money value={num(pool?.protocolReserves, debtDecimals)} compact />} />
          <Figure label="Reserve factor" value="20%" hint="Share of interest retained" />
          <Figure label="Origination fee" value="0.25%" hint="Charged on new borrows" />
          <Figure label="Treasury" value={short(pool?.treasury || TREASURY_ADDRESS)} />
        </FigureRow>
      </Section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  unit,
  button,
  onSubmit,
  disabled,
  hint,
  variant = "secondary",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  button: string;
  onSubmit: () => void;
  disabled?: boolean;
  hint?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <form
      className="space-y-2 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="block text-[14px] font-medium text-ink-2">{label}</label>
      <div className="flex gap-2">
        <AmountInput value={value} onChange={onChange} unit={unit} disabled={disabled} />
        <Button type="submit" size="lg" variant={variant} disabled={disabled} className="shrink-0">
          {button}
        </Button>
      </div>
      {hint && <p className="text-[13px] leading-snug text-ink-4">{hint}</p>}
    </form>
  );
}
