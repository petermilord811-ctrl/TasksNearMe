"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import * as React from "react"
import { useTranslations } from "next-intl"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Wraps a Sonner toaster (completion plan 5.19). Sonner gives focus back to where it came from when it leaves the
 * toasts, meant for its hotkey (Alt+T). But a toast is also in the page's Tab order, and one reached that way
 * bounced the next Tab back to the page's last link for as long as it showed, a keyboard trap (WCAG 2.1.2). A
 * toast reached with Tab is left the normal way; the hotkey keeps Sonner's behavior.
 */
function ToastTabGuard({ children }: { children: React.ReactNode }) {
  const tabbing = React.useRef(false)

  React.useEffect(() => {
    const keydown = (event: KeyboardEvent) => { tabbing.current = event.key === "Tab" }
    const pointerdown = () => { tabbing.current = false }
    document.addEventListener("keydown", keydown, true)
    document.addEventListener("pointerdown", pointerdown, true)
    return () => {
      document.removeEventListener("keydown", keydown, true)
      document.removeEventListener("pointerdown", pointerdown, true)
    }
  }, [])

  return <div className="contents" onFocusCapture={(event) => { if (tabbing.current) event.stopPropagation() }}>{children}</div>
}

const Toaster = ({ ...props }: ToasterProps) => {
  const t = useTranslations('feedback')

  return (
    <ToastTabGuard>
    <Sonner
      theme="system"
      containerAriaLabel={t('notifications')}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{ classNames: { toast: '!rounded-2xl !border-foreground/[0.08] !bg-popover !text-popover-foreground !font-sans !shadow-overlay dark:!border-white/[0.08]', title: '!font-semibold', description: '!text-muted-foreground' } }}
      {...props}
    />
    </ToastTabGuard>
  )
}

export { Toaster, ToastTabGuard }
