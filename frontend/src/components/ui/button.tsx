import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary - Brand color for main actions
        default: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm hover:shadow-md",

        // Secondary - Neutral for less prominent actions
        secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:active:bg-neutral-600",

        // Outline - Bordered variant
        outline: "border border-neutral-300 bg-background hover:bg-neutral-50 active:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900 dark:active:bg-neutral-800",

        // Ghost - Minimal, no background
        ghost: "hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700",

        // Destructive - For dangerous actions
        destructive: "bg-error text-white hover:opacity-90 active:opacity-80 shadow-sm",

        // Link - Text-only with underline
        link: "text-brand-600 underline-offset-4 hover:underline dark:text-brand-400",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Render as a child component (e.g., Link from react-router)
   */
  asChild?: boolean
}

/**
 * Button - Primary interactive element
 *
 * Supports multiple visual variants and sizes. Uses OKLCH color tokens
 * for consistent theming across light and dark modes.
 *
 * @example
 * // Primary action
 * <Button>Save Changes</Button>
 *
 * // Secondary action
 * <Button variant="secondary">Cancel</Button>
 *
 * // Icon button
 * <Button variant="ghost" size="icon">
 *   <Settings className="h-4 w-4" />
 * </Button>
 *
 * // As a link
 * <Button asChild>
 *   <Link to="/settings">Settings</Link>
 * </Button>
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
