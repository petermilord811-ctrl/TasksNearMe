"use client"

import * as React from "react"
import { cn } from "@/ui/lib/utils"
import { useHydrated } from "@/ui/lib/hydration"

/**
 * The client side of Button, Input and Textarea for controls that need JavaScript (completion plan 5.19), used
 * until the page hydrates:
 * - a submit button is disabled (and keeps its look: no flash on every page load), which also stops Enter in a
 *   field from sending a script-handled form the browser's way, as a GET with its fields in the address;
 * - any other button is `aria-disabled`, so it stays in the focus order and says it isn't ready;
 * - a text field is read-only: what someone typed would otherwise be reset when its form hydrates.
 * Once hydrated they render exactly as before. `data-hydrating` lets the e2e tests wait for them.
 */
function GatedButton({ disabled, className, ...props }: React.ComponentProps<"button">) {
  const hydrated = useHydrated()
  if (hydrated || disabled) return <button disabled={disabled} className={className} {...props} />
  if (props.type !== "button" && props.type !== "reset") {
    return <button data-hydrating="" disabled className={cn(className, "disabled:opacity-100")} {...props} />
  }
  return <button data-hydrating="" aria-disabled className={className} {...props} />
}

function GatedInput(props: React.ComponentProps<"input">) {
  const hydrated = useHydrated()
  if (hydrated || props.readOnly || props.disabled) return <input {...props} />
  return <input data-hydrating="" {...props} readOnly />
}

function GatedTextarea(props: React.ComponentProps<"textarea">) {
  const hydrated = useHydrated()
  if (hydrated || props.readOnly || props.disabled) return <textarea {...props} />
  return <textarea data-hydrating="" {...props} readOnly />
}

export { GatedButton, GatedInput, GatedTextarea }
