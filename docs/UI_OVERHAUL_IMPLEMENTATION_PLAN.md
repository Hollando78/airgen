# AIRGen UI Overhaul Implementation Plan

## Executive Summary

This document outlines a comprehensive 2-week UI overhaul plan for AIRGen, transforming the current mixed CSS/Tailwind approach into a cohesive, token-based design system. AIRGen already has excellent foundations (Radix UI, shadcn/ui pattern, Tailwind CSS), so this is primarily a standardization and consistency effort rather than a ground-up rebuild.

**Key Goals:**
- Migrate from HSL to OKLCH color system for perceptual uniformity
- Implement strict design token enforcement (spacing, radius, typography)
- Standardize all routes with PageLayout pattern
- Clean up ~1500 lines of legacy CSS
- Ensure accessibility and visual consistency across 15+ routes
- Create drop-in reusable components library

**Timeline:** 2 weeks (10 working days)

---

## Current State Assessment

### ✅ What's Already Working

**Infrastructure:**
- React 18 with Vite build system
- React Router v6 for routing
- React Query (TanStack Query) for server state
- Tailwind CSS 3.4 configured
- shadcn/ui pattern partially implemented

**Dependencies Already Installed:**
- `@radix-ui/react-*` (dialog, dropdown-menu, select, label, etc.)
- `class-variance-authority` for variant management
- `lucide-react` for icons
- `sonner` for toasts
- `tailwind-merge` for class merging
- `tailwindcss-animate` for animations

**Existing UI Components (`frontend/src/components/ui/`):**
- button.tsx
- card.tsx
- dialog.tsx
- dropdown-menu.tsx
- select.tsx
- table.tsx
- input.tsx
- textarea.tsx
- label.tsx
- badge.tsx
- modal.tsx

### ⚠️ What Needs Work

**1. Design Tokens (frontend/src/styles.css)**
- Currently uses HSL format: `--primary: 221.2 83.2% 53.3%`
- Needs migration to OKLCH: `--brand: oklch(0.6 0.2 240)`
- No strict spacing scale enforcement
- Legacy CSS variables mixed with modern tokens

**2. Layout Inconsistency**
- Each route has different layout patterns
- No standardized PageLayout wrapper
- Inconsistent spacing and max-width constraints
- Breadcrumbs not implemented

**3. Legacy CSS Overhead**
- ~1500+ lines of legacy CSS in styles.css
- Mix of `.app-shell`, `.panel`, `.form-group` classes
- Needs gradual migration to Tailwind utilities

**4. Component Gaps**
- No EmptyState component
- No Breadcrumbs component
- No ThemeToggle component
- No FormField wrapper component
- No Skeleton/Loading states standardization

**5. Routes Needing Standardization (15+ routes)**
- ProductionDashboardRoute.tsx
- InterfaceRoute.tsx
- DraftsRoute.tsx
- AdminUsersRoute.tsx
- AirGenRoute.tsx
- DocumentsRoute.tsx
- LinkSetsRoute.tsx
- RequirementsSchemaRoute.tsx
- LinksRoute.tsx
- AdminRequirementsRoute.tsx
- RequirementsRoute.tsx
- GraphViewerRoute.tsx
- DashboardRoute.tsx
- AdminRecoveryRoute.tsx
- BaselinesRoute.tsx

---

## Design Token System

### Color System: HSL → OKLCH Migration

**Why OKLCH?**
- Perceptually uniform (equal visual differences for equal numeric differences)
- Better for programmatic color manipulation
- Consistent lightness across hues
- Superior dark mode color relationships

**Token Structure:**

```css
/* frontend/src/styles.css */
@layer base {
  :root {
    /* Neutral Scale (OKLCH format) */
    --neutral-50: oklch(0.98 0 0);
    --neutral-100: oklch(0.96 0.002 270);
    --neutral-200: oklch(0.92 0.005 270);
    --neutral-300: oklch(0.85 0.01 270);
    --neutral-400: oklch(0.70 0.015 270);
    --neutral-500: oklch(0.55 0.02 270);
    --neutral-600: oklch(0.45 0.025 270);
    --neutral-700: oklch(0.35 0.03 270);
    --neutral-800: oklch(0.25 0.025 270);
    --neutral-900: oklch(0.15 0.02 270);
    --neutral-950: oklch(0.10 0.015 270);

    /* Brand Color (Blue) */
    --brand-50: oklch(0.95 0.05 240);
    --brand-100: oklch(0.90 0.08 240);
    --brand-200: oklch(0.82 0.12 240);
    --brand-300: oklch(0.72 0.16 240);
    --brand-400: oklch(0.62 0.20 240);
    --brand-500: oklch(0.55 0.22 240);  /* Primary brand */
    --brand-600: oklch(0.48 0.20 240);
    --brand-700: oklch(0.40 0.18 240);
    --brand-800: oklch(0.32 0.15 240);
    --brand-900: oklch(0.24 0.12 240);

    /* Accent Color (Teal/Cyan) */
    --accent-50: oklch(0.95 0.05 190);
    --accent-100: oklch(0.88 0.08 190);
    --accent-200: oklch(0.78 0.12 190);
    --accent-300: oklch(0.68 0.16 190);
    --accent-400: oklch(0.58 0.18 190);
    --accent-500: oklch(0.50 0.20 190);  /* Primary accent */
    --accent-600: oklch(0.42 0.18 190);
    --accent-700: oklch(0.35 0.15 190);
    --accent-800: oklch(0.28 0.12 190);
    --accent-900: oklch(0.20 0.10 190);

    /* Semantic Colors */
    --success: oklch(0.60 0.18 145);  /* Green */
    --warning: oklch(0.75 0.15 75);   /* Yellow/Orange */
    --error: oklch(0.58 0.22 25);     /* Red */
    --info: oklch(0.62 0.20 240);     /* Blue */

    /* Surface Colors */
    --background: var(--neutral-50);
    --foreground: var(--neutral-900);
    --muted: var(--neutral-100);
    --muted-foreground: var(--neutral-600);
    --card: oklch(1 0 0);  /* Pure white */
    --card-foreground: var(--neutral-900);
    --border: var(--neutral-200);
    --input: var(--neutral-200);
    --ring: var(--brand-500);

    /* Spacing Scale (strict adherence) */
    --space-1: 0.25rem;  /* 4px */
    --space-2: 0.5rem;   /* 8px */
    --space-3: 0.75rem;  /* 12px */
    --space-4: 1rem;     /* 16px */
    --space-6: 1.5rem;   /* 24px */
    --space-8: 2rem;     /* 32px */
    --space-12: 3rem;    /* 48px */
    --space-16: 4rem;    /* 64px */

    /* Radius Scale */
    --radius-sm: 0.375rem;  /* 6px */
    --radius-md: 0.625rem;  /* 10px */
    --radius-full: 9999px;  /* Pills */
    --radius: var(--radius-md); /* Default */

    /* Typography (Inter variable font with clamp scaling) */
    --font-sans: 'Inter Variable', system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

    /* Font sizes with clamp for fluid scaling */
    --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);    /* 12-14px */
    --text-sm: clamp(0.875rem, 0.8rem + 0.3vw, 1rem);        /* 14-16px */
    --text-base: clamp(1rem, 0.95rem + 0.35vw, 1.125rem);    /* 16-18px */
    --text-lg: clamp(1.125rem, 1rem + 0.4vw, 1.25rem);       /* 18-20px */
    --text-xl: clamp(1.25rem, 1.1rem + 0.5vw, 1.5rem);       /* 20-24px */
    --text-2xl: clamp(1.5rem, 1.3rem + 0.7vw, 1.875rem);     /* 24-30px */
    --text-3xl: clamp(1.875rem, 1.6rem + 1vw, 2.25rem);      /* 30-36px */
    --text-4xl: clamp(2.25rem, 1.9rem + 1.5vw, 3rem);        /* 36-48px */

    /* Line heights */
    --leading-tight: 1.2;
    --leading-normal: 1.5;
    --leading-relaxed: 1.7;

    /* Elevation (box-shadow) */
    --elevation-0: none;
    --elevation-1: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --elevation-2: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);

    /* Z-index scale */
    --z-base: 0;
    --z-dropdown: 1000;
    --z-sticky: 1100;
    --z-fixed: 1200;
    --z-modal-backdrop: 1300;
    --z-modal: 1400;
    --z-popover: 1500;
    --z-tooltip: 1600;
  }

  .dark {
    /* Dark mode neutrals (inverted) */
    --neutral-50: oklch(0.15 0.02 270);
    --neutral-100: oklch(0.18 0.02 270);
    --neutral-200: oklch(0.22 0.025 270);
    --neutral-300: oklch(0.28 0.03 270);
    --neutral-400: oklch(0.40 0.025 270);
    --neutral-500: oklch(0.55 0.02 270);
    --neutral-600: oklch(0.65 0.015 270);
    --neutral-700: oklch(0.75 0.01 270);
    --neutral-800: oklch(0.85 0.008 270);
    --neutral-900: oklch(0.92 0.005 270);
    --neutral-950: oklch(0.96 0.002 270);

    /* Dark mode brand (slightly desaturated) */
    --brand-500: oklch(0.65 0.18 240);
    --accent-500: oklch(0.60 0.16 190);

    /* Dark mode surfaces */
    --background: oklch(0.15 0.02 270);
    --foreground: var(--neutral-900);
    --muted: oklch(0.20 0.025 270);
    --muted-foreground: var(--neutral-400);
    --card: oklch(0.18 0.02 270);
    --card-foreground: var(--neutral-900);
    --border: oklch(0.28 0.03 270);
    --input: oklch(0.28 0.03 270);

    /* Dark mode elevation (lighter shadows with glow) */
    --elevation-1: 0 1px 2px 0 rgb(0 0 0 / 0.3);
    --elevation-2: 0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.3);
  }
}

/* Global resets and defaults */
@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  h1, h2, h3, h4, h5, h6 {
    line-height: var(--leading-tight);
    font-weight: 600;
  }

  h1 { font-size: var(--text-4xl); }
  h2 { font-size: var(--text-3xl); }
  h3 { font-size: var(--text-2xl); }
  h4 { font-size: var(--text-xl); }
  h5 { font-size: var(--text-lg); }
  h6 { font-size: var(--text-base); }

  /* Focus visible styles */
  *:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  /* Constrain text line length for readability */
  p, li {
    max-width: 70ch;
  }
}
```

**Tailwind Config Update:**

```javascript
// frontend/tailwind.config.js
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Map to CSS variables (OKLCH format)
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        brand: {
          50: "var(--brand-50)",
          100: "var(--brand-100)",
          200: "var(--brand-200)",
          300: "var(--brand-300)",
          400: "var(--brand-400)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
          800: "var(--brand-800)",
          900: "var(--brand-900)",
          DEFAULT: "var(--brand-500)",
        },
        accent: {
          50: "var(--accent-50)",
          100: "var(--accent-100)",
          200: "var(--accent-200)",
          300: "var(--accent-300)",
          400: "var(--accent-400)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
          700: "var(--accent-700)",
          800: "var(--accent-800)",
          900: "var(--accent-900)",
          DEFAULT: "var(--accent-500)",
        },
        neutral: {
          50: "var(--neutral-50)",
          100: "var(--neutral-100)",
          200: "var(--neutral-200)",
          300: "var(--neutral-300)",
          400: "var(--neutral-400)",
          500: "var(--neutral-500)",
          600: "var(--neutral-600)",
          700: "var(--neutral-700)",
          800: "var(--neutral-800)",
          900: "var(--neutral-900)",
          950: "var(--neutral-950)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        info: "var(--info)",
      },
      spacing: {
        1: "var(--space-1)",   // 4px
        2: "var(--space-2)",   // 8px
        3: "var(--space-3)",   // 12px
        4: "var(--space-4)",   // 16px
        6: "var(--space-6)",   // 24px
        8: "var(--space-8)",   // 32px
        12: "var(--space-12)", // 48px
        16: "var(--space-16)", // 64px
      },
      borderRadius: {
        sm: "var(--radius-sm)",   // 6px
        md: "var(--radius-md)",   // 10px
        lg: "var(--radius-md)",   // 10px (same as md)
        full: "var(--radius-full)", // pills
        DEFAULT: "var(--radius)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
        "4xl": "var(--text-4xl)",
      },
      boxShadow: {
        sm: "var(--elevation-1)",
        md: "var(--elevation-2)",
        DEFAULT: "var(--elevation-1)",
      },
      maxWidth: {
        prose: "70ch",
        "7xl": "80rem", // Page content max width
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in": {
          from: { transform: "translateY(-8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
```

---

## PageLayout Pattern Implementation

### Core PageLayout Component

```typescript
// frontend/src/components/layout/PageLayout.tsx

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

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
```

### PageHeader Component (for in-page sections)

```typescript
// frontend/src/components/layout/PageHeader.tsx

import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

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
```

### Usage Examples

```typescript
// Example 1: Simple page
function DocumentsRoute() {
  return (
    <PageLayout
      title="Documents"
      description="Manage your project documents and files."
      actions={
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      }
    >
      <DocumentsList />
    </PageLayout>
  );
}

// Example 2: Page with tabs
function RequirementsRoute() {
  return (
    <PageLayout
      title="Requirements"
      description="System requirements and specifications."
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Requirements' },
      ]}
      tabs={
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Requirements</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      actions={
        <>
          <Button variant="outline">Export</Button>
          <Button>Create Requirement</Button>
        </>
      }
    >
      <RequirementsTable />
    </PageLayout>
  );
}

// Example 3: Nested page section
function SettingsPage() {
  return (
    <PageLayout title="Settings" maxWidth="6xl">
      <PageHeader
        title="General Settings"
        description="Manage your account preferences and settings."
      />
      <SettingsForm />

      <PageHeader
        title="Notifications"
        description="Configure how you receive notifications."
        className="mt-12"
      />
      <NotificationSettings />
    </PageLayout>
  );
}
```

---

## Component Library Strategy

### Component Audit Results

**Existing Components (frontend/src/components/ui/):**

| Component | Status | Action Needed |
|-----------|--------|---------------|
| button.tsx | ✅ Good | Update variants to use OKLCH tokens |
| card.tsx | ✅ Good | Verify spacing uses strict scale |
| dialog.tsx | ✅ Good | Add animation defaults |
| dropdown-menu.tsx | ✅ Good | Verify z-index uses token |
| select.tsx | ✅ Good | Test with OKLCH colors |
| table.tsx | ⚠️ Review | Add density toggle, sticky header support |
| input.tsx | ✅ Good | Verify focus ring |
| textarea.tsx | ✅ Good | Verify focus ring |
| label.tsx | ✅ Good | No changes needed |
| badge.tsx | ⚠️ Review | Add status color variants |
| modal.tsx | ⚠️ Duplicate? | Consolidate with dialog.tsx |

### Missing Components to Create

#### 1. EmptyState Component

```typescript
// frontend/src/components/ui/empty-state.tsx

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

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
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-4">
          <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-prose mb-6">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {action.icon && <action.icon className="h-4 w-4 mr-2" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}

// Usage example:
// <EmptyState
//   icon={FileText}
//   title="No documents found"
//   description="Get started by uploading your first document."
//   action={{
//     label: "Upload Document",
//     onClick: () => openUploadDialog(),
//     icon: Plus,
//   }}
// />
```

#### 2. Skeleton Component

```typescript
// frontend/src/components/ui/skeleton.tsx

import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps): JSX.Element {
  const variantClasses = {
    text: 'h-4 rounded-sm',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  return (
    <div
      className={cn(
        'animate-pulse bg-muted',
        variantClasses[variant],
        className
      )}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

// Pre-composed skeleton patterns
export function SkeletonCard(): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-card p-6">
      <Skeleton className="h-6 w-1/3 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-5/6 mb-4" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export function SkeletonTable(): JSX.Element {
  return (
    <div className="space-y-2">
      <Skeleton className="h-12 w-full" /> {/* Header */}
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
```

#### 3. Breadcrumbs Component

```typescript
// frontend/src/components/ui/breadcrumbs.tsx

import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  showHomeIcon?: boolean;
  className?: string;
}

export function Breadcrumbs({
  items,
  showHomeIcon = false,
  className,
}: BreadcrumbsProps): JSX.Element {
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
```

#### 4. ThemeToggle Component

```typescript
// frontend/src/components/ui/theme-toggle.tsx

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './button';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle theme"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

// Theme hook
// frontend/src/hooks/useTheme.ts
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return { theme, setTheme: setThemeState };
}
```

#### 5. FormField Wrapper Component

```typescript
// frontend/src/components/ui/form-field.tsx

import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FormFieldProps): JSX.Element {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1">
        {label}
        {required && <span className="text-error" aria-label="required">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Usage with React Hook Form:
// <FormField
//   label="Email"
//   htmlFor="email"
//   required
//   error={errors.email?.message}
//   hint="We'll never share your email."
// >
//   <Input
//     id="email"
//     type="email"
//     {...register('email')}
//     aria-invalid={!!errors.email}
//   />
// </FormField>
```

#### 6. Updated Button Component

```typescript
// frontend/src/components/ui/button.tsx (updated)

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Primary (brand background)
        primary: 'bg-brand text-white hover:bg-brand-600 active:bg-brand-700',

        // Secondary (outline)
        secondary: 'border border-border bg-transparent hover:bg-muted active:bg-neutral-200 dark:active:bg-neutral-700',

        // Tertiary (ghost)
        ghost: 'bg-transparent hover:bg-muted active:bg-neutral-200 dark:active:bg-neutral-700',

        // Destructive
        destructive: 'bg-error text-white hover:opacity-90 active:opacity-80',

        // Link style
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
```

#### 7. Updated Badge Component (Status Colors)

```typescript
// frontend/src/components/ui/badge.tsx (updated)

import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
        success: 'bg-success/10 text-success border border-success/20',
        warning: 'bg-warning/10 text-warning border border-warning/20',
        error: 'bg-error/10 text-error border border-error/20',
        info: 'bg-info/10 text-info border border-info/20',
        brand: 'bg-brand/10 text-brand border border-brand/20',
        accent: 'bg-accent/10 text-accent border border-accent/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Status badge helper
export function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
    draft: 'default',
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
    active: 'success',
    inactive: 'default',
    archived: 'default',
  };

  const variant = statusMap[status.toLowerCase()] || 'default';

  return <Badge variant={variant}>{status}</Badge>;
}
```

---

## 2-Week Implementation Roadmap

### Week 1: Foundations & Core Components

**Day 1-2: Token Setup & Migration**
- [ ] Update `frontend/src/styles.css` with OKLCH color system
- [ ] Update `frontend/tailwind.config.js` with new token mappings
- [ ] Add Inter Variable font to project (via CDN or local)
- [ ] Create `useTheme` hook for dark mode
- [ ] Test token system with existing components
- [ ] Document token usage guidelines

**Day 3: Layout Components**
- [ ] Create `PageLayout` component
- [ ] Create `PageHeader` component
- [ ] Create `Breadcrumbs` component
- [ ] Update `AppLayout.tsx` to use new navigation structure
- [ ] Test responsive behavior on mobile/tablet

**Day 4-5: Core UI Components**
- [ ] Update `Button` component with new variants
- [ ] Update `Badge` component with status colors
- [ ] Create `EmptyState` component
- [ ] Create `Skeleton` component + presets
- [ ] Create `FormField` wrapper component
- [ ] Create `ThemeToggle` component
- [ ] Test all components in Storybook (optional) or test page

### Week 2: Route Migration & Polish

**Day 6-7: High-Traffic Routes**
- [ ] Migrate `DashboardRoute.tsx` to PageLayout
- [ ] Migrate `DocumentsRoute.tsx` to PageLayout
- [ ] Migrate `RequirementsRoute.tsx` to PageLayout (with tabs)
- [ ] Migrate `AirGenRoute.tsx` to PageLayout
- [ ] Add EmptyState to routes with empty data views
- [ ] Add Skeleton loading states (>300ms)

**Day 8-9: Admin & Secondary Routes**
- [ ] Migrate `AdminUsersRoute.tsx` to PageLayout
- [ ] Migrate `AdminRecoveryRoute.tsx` to PageLayout
- [ ] Migrate `BaselinesRoute.tsx` to PageLayout
- [ ] Migrate `GraphViewerRoute.tsx` to PageLayout (maxWidth="full")
- [ ] Migrate remaining routes to PageLayout
- [ ] Consolidate `modal.tsx` and `dialog.tsx` (if duplicated)

**Day 10: Tables & Forms**
- [ ] Audit all table usages
- [ ] Add sticky header support to `table.tsx`
- [ ] Add density toggle to tables (compact/comfortable)
- [ ] Standardize all forms with `FormField` wrapper
- [ ] Add React Hook Form + Zod to complex forms
- [ ] Test form validation and error states

**Day 11: Accessibility Pass**
- [ ] Run axe DevTools on all routes
- [ ] Fix missing aria-labels and roles
- [ ] Test keyboard navigation (Tab, Enter, Esc)
- [ ] Test screen reader (NVDA/VoiceOver)
- [ ] Verify focus states on all interactive elements
- [ ] Test color contrast (WCAG AA minimum)

**Day 12: Animations & Micro-interactions**
- [ ] Add Framer Motion to package.json (optional)
- [ ] Add fade-in animations to dialogs/modals (100-200ms)
- [ ] Add slide-in animations to toasts
- [ ] Add loading spinners to async buttons
- [ ] Add hover/active states to interactive elements
- [ ] Test animation performance (no jank)

**Day 13: Legacy CSS Cleanup**
- [ ] Audit `styles.css` for unused legacy classes
- [ ] Remove `.app-shell`, `.panel`, `.form-group` legacy styles
- [ ] Migrate remaining CSS to Tailwind utilities
- [ ] Remove unused CSS variables
- [ ] Verify no visual regressions
- [ ] Run CSS bundle size analysis

**Day 14: Final Polish & Documentation**
- [ ] Visual regression testing (Percy/Chromatic optional)
- [ ] Test dark mode on all routes
- [ ] Test responsive behavior (mobile, tablet, desktop)
- [ ] Create component usage documentation
- [ ] Create design token reference guide
- [ ] Take before/after screenshots for changelog
- [ ] Deploy to staging environment
- [ ] User acceptance testing (UAT)

---

## Migration Checklist Per Route

Use this checklist for each route migration:

```markdown
### Route: [Route Name] (e.g., DocumentsRoute.tsx)

- [ ] Import `PageLayout` component
- [ ] Add `title` and `description`
- [ ] Add breadcrumbs (auto or custom)
- [ ] Move action buttons to `actions` prop
- [ ] Add secondary tabs if needed (using `tabs` prop)
- [ ] Remove legacy layout wrapper (if any)
- [ ] Remove inline spacing styles (use PageLayout spacing)
- [ ] Add `EmptyState` for empty data views
- [ ] Add `Skeleton` loading state (if loading >300ms)
- [ ] Test responsive behavior
- [ ] Test dark mode
- [ ] Test keyboard navigation
- [ ] Remove unused CSS classes from legacy styles.css
```

---

## Quick Win Checklist

### Visual Consistency
- [ ] All buttons use 3 variants: primary (brand), secondary (outline), ghost
- [ ] All icons are size 18 or 20 (Lucide)
- [ ] All icon + label gaps are 6-8px (2 in Tailwind)
- [ ] All status badges use semantic colors (success, warning, error, info)
- [ ] All modals have max 2 levels deep
- [ ] All focus states are visible (2px ring)

### Spacing & Layout
- [ ] All pages use PageLayout with max-w-7xl
- [ ] All spacing uses strict scale (4, 8, 12, 16, 24, 32, 48, 64)
- [ ] All sections use 12-column grid
- [ ] All text blocks constrain to 70ch line length

### Typography
- [ ] All headings use line-height 1.2
- [ ] All body text uses line-height 1.5
- [ ] All font sizes use clamp() for fluid scaling
- [ ] Inter Variable font loaded and applied

### Loading & Empty States
- [ ] All async operations >300ms show skeleton
- [ ] All empty data views show EmptyState with action
- [ ] All forms show validation errors inline
- [ ] All tables show "No results" state

### Accessibility
- [ ] All interactive elements have visible focus state
- [ ] All icons have aria-hidden or aria-label
- [ ] All forms have proper labels and error messages
- [ ] All color contrast meets WCAG AA (4.5:1)

---

## Drop-in Component Library Code

### Card Variants

```typescript
// frontend/src/components/ui/card-variants.tsx

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './card';
import { Button } from './button';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
}

export function StatCard({ title, value, change, trend, icon: Icon }: StatCardProps) {
  const trendColors = {
    up: 'text-success',
    down: 'text-error',
    neutral: 'text-muted-foreground',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-semibold">{value}</p>
            {change && (
              <p className={`text-sm mt-1 ${trendColors[trend || 'neutral']}`}>
                {change}
              </p>
            )}
          </div>
          {Icon && (
            <div className="rounded-full bg-brand/10 p-3">
              <Icon className="h-6 w-6 text-brand" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ActionCardProps {
  title: string;
  description: string;
  action: {
    label: string;
    onClick: () => void;
  };
  icon?: LucideIcon;
}

export function ActionCard({ title, description, action, icon: Icon }: ActionCardProps) {
  return (
    <Card className="hover:border-brand/50 transition-colors">
      <CardHeader>
        {Icon && (
          <div className="mb-4 rounded-lg bg-brand/10 p-3 w-fit">
            <Icon className="h-6 w-6 text-brand" />
          </div>
        )}
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={action.onClick} variant="secondary" className="w-full">
          {action.label}
        </Button>
      </CardContent>
    </Card>
  );
}
```

### Table Enhancements

```typescript
// frontend/src/components/ui/table-enhanced.tsx

import React, { useState } from 'react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './table';
import { Button } from './button';
import { MoreHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './dropdown-menu';

type SortDirection = 'asc' | 'desc' | null;

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

interface EnhancedTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  density?: 'compact' | 'comfortable';
  stickyHeader?: boolean;
  rowActions?: (row: T) => Array<{
    label: string;
    onClick: () => void;
  }>;
}

export function EnhancedTable<T>({
  columns,
  data,
  keyExtractor,
  density = 'comfortable',
  stickyHeader = false,
  rowActions,
}: EnhancedTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : sortDirection === 'desc' ? null : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection]);

  const cellPadding = density === 'compact' ? 'py-2' : 'py-4';

  return (
    <div className="relative overflow-x-auto">
      <Table>
        <TableHeader className={stickyHeader ? 'sticky top-0 bg-card z-10' : ''}>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={column.sortable ? 'cursor-pointer select-none' : ''}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-2">
                  {column.label}
                  {column.sortable && sortKey === column.key && (
                    sortDirection === 'asc' ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : sortDirection === 'desc' ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : null
                  )}
                </div>
              </TableHead>
            ))}
            {rowActions && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row) => (
            <TableRow key={keyExtractor(row)}>
              {columns.map((column) => (
                <TableCell key={column.key} className={cellPadding}>
                  {column.render ? column.render(row) : (row as any)[column.key]}
                </TableCell>
              ))}
              {rowActions && (
                <TableCell className={cellPadding}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {rowActions(row).map((action, idx) => (
                        <DropdownMenuItem key={idx} onClick={action.onClick}>
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

## Testing Strategy

### Visual Regression Testing (Optional)

If using Percy or Chromatic:

```bash
# Install Percy
npm install --save-dev @percy/cli @percy/playwright

# Take snapshots
npx percy snapshot snapshots/ --config percy.config.yml
```

Percy config:
```yaml
# percy.config.yml
version: 2
static:
  snapshots:
    - name: "Dashboard - Light"
      url: "http://localhost:5173/dashboard"
    - name: "Dashboard - Dark"
      url: "http://localhost:5173/dashboard"
      additionalSnapshots:
        - suffix: " - Dark"
          execute: |
            document.documentElement.classList.add('dark');
    - name: "Requirements"
      url: "http://localhost:5173/requirements"
    # ... add more routes
```

### Accessibility Testing

```bash
# Install axe-core
npm install --save-dev @axe-core/playwright

# Run accessibility tests
npx playwright test a11y.spec.ts
```

Example test:
```typescript
// tests/a11y.spec.ts
import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Accessibility', () => {
  test('Dashboard page', async ({ page }) => {
    await page.goto('http://localhost:5173/dashboard');
    await injectAxe(page);
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true,
      },
    });
  });
});
```

---

## Success Metrics

After 2-week implementation, measure:

**Consistency:**
- [ ] 100% of routes use PageLayout pattern
- [ ] 0 instances of legacy spacing (all use token scale)
- [ ] All buttons use 3 standard variants
- [ ] All icons use consistent size (18 or 20)

**Accessibility:**
- [ ] 0 critical accessibility issues (axe-core)
- [ ] 100% keyboard navigable
- [ ] All color contrast meets WCAG AA

**Code Quality:**
- [ ] <500 lines of legacy CSS remaining
- [ ] All components use Tailwind utilities
- [ ] All colors use OKLCH tokens
- [ ] CSS bundle size reduced by >30%

**User Experience:**
- [ ] All loading states >300ms show skeleton
- [ ] All empty states have clear CTAs
- [ ] Dark mode works on all routes
- [ ] Mobile responsive on all routes

---

## Common Patterns Reference

### Icon + Label Pattern
```tsx
<Button>
  <Plus className="h-4 w-4 mr-2" />
  Create New
</Button>
```

### Status Badge Pattern
```tsx
<StatusBadge status={requirement.status} />
```

### Empty State Pattern
```tsx
{data.length === 0 && (
  <EmptyState
    icon={FileText}
    title="No documents found"
    description="Upload your first document to get started."
    action={{
      label: "Upload Document",
      onClick: () => openDialog(),
      icon: Upload,
    }}
  />
)}
```

### Loading Skeleton Pattern
```tsx
{isLoading ? (
  <SkeletonTable />
) : (
  <EnhancedTable data={data} columns={columns} />
)}
```

### Form Field Pattern
```tsx
<FormField
  label="Project Name"
  htmlFor="name"
  required
  error={errors.name?.message}
  hint="Choose a unique name for your project."
>
  <Input
    id="name"
    {...register('name', { required: 'Project name is required' })}
  />
</FormField>
```

---

## Next Steps After Implementation

1. **Document Component Library** - Create Storybook or usage docs
2. **Create Design System Site** - Internal reference for tokens and components
3. **Establish Contribution Guidelines** - How to add new components/patterns
4. **Setup Visual Regression CI** - Automate screenshot comparisons
5. **Conduct User Training** - Show new patterns to team
6. **Gather User Feedback** - Identify pain points and improvements

---

## Resources

- [OKLCH Color Picker](https://oklch.com/)
- [Radix UI Documentation](https://www.radix-ui.com/)
- [shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Inter Font](https://rsms.me/inter/)
- [Lucide Icons](https://lucide.dev/)

---

## Conclusion

This 2-week UI overhaul plan leverages AIRGen's existing infrastructure (Radix UI, Tailwind, React) while introducing strict design token discipline, consistent layout patterns, and accessible component primitives. The focus is on **standardization**, not reinvention.

By the end of Week 2, AIRGen will have:
- Modern OKLCH color system with dark mode
- Consistent PageLayout pattern across all routes
- Reusable component library with proper variants
- Accessible, keyboard-navigable UI
- Significantly reduced CSS overhead
- Clear guidelines for future development

The key to success is **incremental migration** (route by route) and **strict adherence** to the design token system. Every spacing value, color, and radius should come from the token system—no magic numbers.
