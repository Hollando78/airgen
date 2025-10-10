import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Default - Brand color
        default: "border-transparent bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",

        // Secondary - Neutral
        secondary: "border-transparent bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",

        // Status variants using semantic colors
        success: "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",

        warning: "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",

        error: "border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",

        info: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",

        // Outline - Bordered variant
        outline: "border-neutral-300 text-foreground dark:border-neutral-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Badge - Small status indicator or label
 *
 * Used to display status, categories, or counts. Supports multiple
 * semantic variants for different types of information.
 *
 * @example
 * // Status indicators
 * <Badge variant="success">Active</Badge>
 * <Badge variant="warning">Pending</Badge>
 * <Badge variant="error">Failed</Badge>
 *
 * // Category labels
 * <Badge variant="default">Feature</Badge>
 * <Badge variant="secondary">Documentation</Badge>
 *
 * // Count badge
 * <Badge variant="info">3 new</Badge>
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }