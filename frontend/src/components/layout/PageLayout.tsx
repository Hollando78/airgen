import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageLayoutProps {
  /**
   * Page title (displays as h1)
   */
  title: string;

  /**
   * Optional description below title
   */
  description?: string;

  /**
   * Breadcrumb items (auto-generated from route if not provided)
   */
  breadcrumbs?: BreadcrumbItem[];

  /**
   * Action buttons in header (e.g., "Create New", "Export")
   */
  actions?: React.ReactNode;

  /**
   * Optional tabs for secondary navigation
   */
  tabs?: React.ReactNode;

  /**
   * Main content
   */
  children: React.ReactNode;

  /**
   * Max width constraint (default: 7xl = 80rem)
   */
  maxWidth?: '7xl' | 'full' | '6xl' | '5xl';

  /**
   * Additional className for customization
   */
  className?: string;
}

export function PageLayout({
  title,
  description,
  breadcrumbs,
  actions,
  tabs,
  children,
  maxWidth = '7xl',
  className,
}: PageLayoutProps): JSX.Element {
  const location = useLocation();

  // Auto-generate breadcrumbs from route if not provided
  const computedBreadcrumbs = breadcrumbs || generateBreadcrumbs(location.pathname);

  const maxWidthClass = {
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    'full': 'max-w-full',
  }[maxWidth];

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b border-border bg-card">
        <div className={cn('mx-auto px-6 py-6', maxWidthClass)}>
          {/* Breadcrumbs */}
          {computedBreadcrumbs.length > 0 && (
            <nav className="mb-4" aria-label="Breadcrumb">
              <ol className="flex items-center gap-2 text-sm text-muted-foreground">
                {computedBreadcrumbs.map((crumb, index) => (
                  <li key={index} className="flex items-center gap-2">
                    {index > 0 && (
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    {crumb.href ? (
                      <Link
                        to={crumb.href}
                        className="hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-foreground font-medium">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {/* Title & Actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-semibold text-foreground mb-2">
                {title}
              </h1>
              {description && (
                <p className="text-muted-foreground max-w-prose">
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

          {/* Secondary Navigation Tabs */}
          {tabs && (
            <div className="mt-6 -mb-px">
              {tabs}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className={cn('mx-auto px-6 py-8', maxWidthClass, className)}>
        {children}
      </main>
    </div>
  );
}

/**
 * Auto-generate breadcrumbs from pathname
 * Example: /admin/users/123 → [Dashboard, Admin, Users, User Details]
 */
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/dashboard' },
  ];

  let path = '';
  segments.forEach((segment, index) => {
    path += `/${segment}`;

    // Format segment (remove hyphens, capitalize)
    const label = segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Last segment has no href (current page)
    const isLast = index === segments.length - 1;

    breadcrumbs.push({
      label,
      href: isLast ? undefined : path,
    });
  });

  return breadcrumbs;
}
