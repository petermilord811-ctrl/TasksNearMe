import * as React from "react"
import { cn } from "@/ui/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-base shadow-[inset_0_1px_2px_rgb(23_18_14/0.05)] transition-[color,background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] outline-none placeholder:text-muted-foreground hover:border-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:bg-white/[0.035] dark:shadow-none dark:hover:border-foreground/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
