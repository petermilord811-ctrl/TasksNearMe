"use client"

import * as React from "react"
import { cn } from "@/ui/lib/utils"
import { useHydrationGate } from "@/ui/lib/hydration"
import { Switch as SwitchPrimitive } from "radix-ui"

/** A switch with a 44 px touch area around it (UI-021), so it works on its own in a table cell. */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  const gate = useHydrationGate()
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full after:absolute after:-inset-[13px] after:content-[''] data-[size=sm]:after:-inset-[15px] border border-transparent shadow-[inset_0_1px_2px_rgb(23_18_14/0.12)] transition-[background-color,box-shadow] duration-300 ease-[var(--ease-out)] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        className
      )}
      {...gate}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background shadow-[0_1px_3px_rgb(23_18_14/0.25)] ring-0 transition-transform duration-300 ease-[var(--ease-spring)] group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
