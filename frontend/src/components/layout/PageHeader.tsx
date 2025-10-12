import React from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  /**
   * Section title
   */
  title: string;

  /**
   * Optional description below title
   */
  description?: string;

  /**
   * Action buttons or controls for this section
   */
  actions?: React.ReactNode;

  /**
   * Additional className for customization
   */
  className?: string;
}

/**
 * PageHeader - Used for section headers within a page
 *
 * This component creates consistent section breaks within a PageLayout.
 * Use it to organize content into logical sections with their own titles and actions.
 *
 * @example
 * <PageHeader
 *   title="General Settings"
 *   description="Manage your account preferences and settings."
 *   actions={<Button>Save Changes</Button>}
 * />
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps): JSX.Element {
  return (
    <div className={cn('mb-8', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-semibold text-foreground mb-1">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground max-w-prose">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
