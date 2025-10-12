import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps {
  /**
   * Visual variant/preset
   */
  variant?: 'text' | 'avatar' | 'card' | 'table' | 'custom';

  /**
   * Number of rows (for text/table variants)
   */
  rows?: number;

  /**
   * Additional className for customization
   */
  className?: string;

  /**
   * Width override (for custom variant)
   */
  width?: string;

  /**
   * Height override (for custom variant)
   */
  height?: string;
}

/**
 * Skeleton - Loading placeholder component
 *
 * Provides animated loading states for various content types.
 * Uses subtle shimmer animation for better perceived performance.
 *
 * @example
 * // Text loading
 * <Skeleton variant="text" rows={3} />
 *
 * // Avatar loading
 * <Skeleton variant="avatar" />
 *
 * // Card loading
 * <Skeleton variant="card" />
 *
 * // Custom dimensions
 * <Skeleton variant="custom" width="200px" height="32px" />
 */
export function Skeleton({
  variant = 'custom',
  rows = 3,
  className,
  width,
  height,
}: SkeletonProps): JSX.Element {
  // Base skeleton element
  const SkeletonBase = ({ className: baseClassName }: { className?: string }) => (
    <div
      className={cn(
        'animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800',
        'relative overflow-hidden',
        'before:absolute before:inset-0',
        'before:translate-x-[-100%]',
        'before:bg-gradient-to-r',
        'before:from-transparent before:via-neutral-100/50 dark:before:via-neutral-700/50 before:to-transparent',
        'before:animate-shimmer',
        baseClassName
      )}
      role="status"
      aria-label="Loading"
    />
  );

  // Text variant
  if (variant === 'text') {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBase
            key={i}
            className={cn(
              'h-4',
              // Last row is shorter for natural text appearance
              i === rows - 1 ? 'w-4/5' : 'w-full'
            )}
          />
        ))}
      </div>
    );
  }

  // Avatar variant
  if (variant === 'avatar') {
    return (
      <SkeletonBase
        className={cn('h-10 w-10 rounded-full', className)}
      />
    );
  }

  // Card variant
  if (variant === 'card') {
    return (
      <div className={cn('space-y-4 p-6 border border-border rounded-lg', className)}>
        <SkeletonBase className="h-6 w-2/3" />
        <div className="space-y-3">
          <SkeletonBase className="h-4 w-full" />
          <SkeletonBase className="h-4 w-full" />
          <SkeletonBase className="h-4 w-4/5" />
        </div>
        <div className="flex gap-3 pt-4">
          <SkeletonBase className="h-10 w-24" />
          <SkeletonBase className="h-10 w-24" />
        </div>
      </div>
    );
  }

  // Table variant
  if (variant === 'table') {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Table header */}
        <div className="flex gap-4 pb-3 border-b border-border">
          <SkeletonBase className="h-4 w-1/4" />
          <SkeletonBase className="h-4 w-1/4" />
          <SkeletonBase className="h-4 w-1/4" />
          <SkeletonBase className="h-4 w-1/4" />
        </div>
        {/* Table rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3">
            <SkeletonBase className="h-4 w-1/4" />
            <SkeletonBase className="h-4 w-1/4" />
            <SkeletonBase className="h-4 w-1/4" />
            <SkeletonBase className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    );
  }

  // Custom variant
  return (
    <SkeletonBase
      className={cn(
        width && `w-[${width}]`,
        height && `h-[${height}]`,
        !width && !height && 'h-4 w-full',
        className
      )}
    />
  );
}

/**
 * SkeletonText - Convenience component for text loading
 */
export function SkeletonText({ rows = 3, className }: { rows?: number; className?: string }) {
  return <Skeleton variant="text" rows={rows} className={className} />;
}

/**
 * SkeletonAvatar - Convenience component for avatar loading
 */
export function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton variant="avatar" className={className} />;
}

/**
 * SkeletonCard - Convenience component for card loading
 */
export function SkeletonCard({ className }: { className?: string }) {
  return <Skeleton variant="card" className={className} />;
}

/**
 * SkeletonTable - Convenience component for table loading
 */
export function SkeletonTable({ rows = 5, className }: { rows?: number; className?: string }) {
  return <Skeleton variant="table" rows={rows} className={className} />;
}
