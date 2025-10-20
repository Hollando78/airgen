import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  /**
   * Array of breadcrumb items to display
   */
  items: BreadcrumbItem[];

  /**
   * Show home icon for first item
   */
  showHomeIcon?: boolean;

  /**
   * Additional className for customization
   */
  className?: string;
}

/**
 * Breadcrumbs - Navigation breadcrumbs component
 *
 * Displays a hierarchical navigation trail for the current page location.
 * Supports custom icons and automatically handles the last item as the current page.
 *
 * @example
 * <Breadcrumbs
 *   items={[
 *     { label: 'Dashboard', href: '/dashboard' },
 *     { label: 'Settings', href: '/settings' },
 *     { label: 'Profile' } // current page, no href
 *   ]}
 *   showHomeIcon
 * />
 */
export function Breadcrumbs({
  items,
  showHomeIcon = false,
  className,
}: BreadcrumbsProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center', className)}>
      <ol className="flex items-center gap-2 text-sm">
        {items.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === items.length - 1;

          return (
            <li key={index} className="flex items-center gap-2">
              {!isFirst && (
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              {item.href ? (
                <Link
                  to={item.href}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isFirst && showHomeIcon && (
                    <Home className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 text-foreground font-medium">
                  {isFirst && showHomeIcon && (
                    <Home className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
