import { cn } from "@/ui/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("ui-shimmer rounded-xl", className)}
      {...props}
    />
  )
}

export { Skeleton }
