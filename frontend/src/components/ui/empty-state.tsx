import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

interface EmptyStateProps {
  /**
   * Icon to display (from lucide-react)
   */
  icon?: LucideIcon;

  /**
   * Main heading text
   */
  title: string;

  /**
   * Optional description text
   */
  description?: string;

  /**
   * Optional action button
   */
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };

  /**
   * Additional className for customization
   */
  className?: string;
}

/**
 * EmptyState - Display component for empty data views
 *
 * Used to communicate that a section or view has no data, with optional
 * call-to-action to help users understand next steps.
 *
 * @example
 * <EmptyState
 *   icon={FileText}
 *   title="No documents yet"
 *   description="Get started by creating your first document."
 *   action={{
 *     label: "Create Document",
 *     onClick: () => navigate('/documents/new'),
 *     icon: Plus
 *   }}
 * />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'py-12 px-6',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {Icon && (
        <div
          className="mb-4 rounded-full bg-neutral-100 dark:bg-neutral-800 p-6"
          aria-hidden="true"
        >
          <Icon className="h-10 w-10 text-neutral-400 dark:text-neutral-500" />
        </div>
      )}

      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {description}
        </p>
      )}

      {action && (
        <Button
          onClick={action.onClick}
          variant="default"
          className="gap-2"
        >
          {action.icon && <action.icon className="h-4 w-4" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
