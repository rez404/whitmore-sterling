import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  // Disabled is styled per variant rather than with a blanket opacity — a faded
  // lime button reads as murky olive, which looks broken instead of inactive.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-medium transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-ink-4 disabled:shadow-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:bg-accent/90 font-semibold",
        secondary: "bg-surface-3 text-ink hover:bg-surface-3/70 border border-line",
        outline: "border border-line-strong text-ink hover:bg-surface-2",
        ghost: "text-ink-2 hover:text-ink hover:bg-surface-2 disabled:bg-transparent",
        danger: "bg-down/15 text-down border border-down/30 hover:bg-down/25",
      },
      size: {
        sm: "h-8 px-3 text-[14px] [&_svg]:size-3.5",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-sm [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
