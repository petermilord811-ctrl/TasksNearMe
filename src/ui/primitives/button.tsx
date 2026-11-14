import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/ui/lib/utils"
import { Slot } from "radix-ui"
import { GatedButton } from "./gated"

/**
 * Pill buttons, as on the landing page: a 44 px touch target, a soft lift on hover (the filled ones glow in their
 * color), a quick press, and a clear focus ring. Multi-line buttons keep the same corners.
 */
const buttonVariants = cva(
  "relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[1.375rem] text-sm font-medium whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,translate,scale,opacity] duration-200 ease-[var(--ease-out)] outline-none active:scale-[0.97] active:duration-75 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary font-semibold text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(90_30_5/0.16),0_8px_18px_-10px_var(--primary-glow)] hover:-translate-y-px hover:bg-primary-hover hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_2px_4px_rgb(90_30_5/0.14),0_14px_26px_-12px_var(--primary-glow)]",
        destructive:
          "bg-destructive font-semibold text-destructive-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(80_10_5/0.18),0_8px_18px_-10px_rgb(180_35_24/0.45)] hover:-translate-y-px hover:bg-destructive/90 focus-visible:ring-destructive",
        outline:
          "border border-foreground/[0.14] bg-card text-foreground shadow-[0_1px_2px_rgb(23_18_14/0.05)] hover:-translate-y-px hover:border-foreground/25 hover:shadow-[0_1px_2px_rgb(23_18_14/0.05),0_10px_20px_-14px_rgb(60_30_10/0.45)] dark:border-white/[0.12] dark:bg-white/[0.04] dark:hover:border-white/[0.2] dark:hover:bg-white/[0.07]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--primary)_10%)]",
        ghost:
          "hover:bg-foreground/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-5 py-2 has-[>svg]:px-4",
        xs: "h-6 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-10 px-6 text-[0.9375rem] has-[>svg]:px-5",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * `progressive`: the button works without JavaScript (a GET search form's submit). Any other button that does
 * something (a click handler, or submitting a form the page's scripts handle) waits for the page to hydrate
 * (src/ui/primitives/gated.tsx, completion plan 5.19). Links (`asChild`) never wait.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  progressive = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    progressive?: boolean
  }) {
  const Comp = asChild ? Slot.Root : progressive || (props.type === "button" && !props.onClick) ? "button" : GatedButton

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
