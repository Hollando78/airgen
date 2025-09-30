import * as React from "react"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import { cn } from "../../lib/utils"

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: "sm" | "md" | "lg" | "xl" | "2xl"
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = "md",
  children,
  footer,
  className = ""
}: ModalProps): JSX.Element {
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md", 
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl"
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(sizeClasses[size], className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        
        <div className="py-4">
          {children}
        </div>
        
        {footer && (
          <div className="flex items-center justify-end space-x-2 pt-4 border-t">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}