import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, type Theme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Button } from './button';

interface ThemeToggleProps {
  /**
   * Display variant
   */
  variant?: 'icon' | 'full';

  /**
   * Additional className for customization
   */
  className?: string;
}

/**
 * ThemeToggle - Dark mode toggle component
 *
 * Provides a dropdown menu to switch between light, dark, and system themes.
 * Persists selection to localStorage and respects system preferences.
 *
 * @example
 * // Icon-only button (for compact layouts)
 * <ThemeToggle variant="icon" />
 *
 * // Full button with label (for settings pages)
 * <ThemeToggle variant="full" />
 */
export function ThemeToggle({
  variant = 'icon',
  className,
}: ThemeToggleProps): JSX.Element {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: 'light',
      label: 'Light',
      icon: <Sun className="h-4 w-4" />,
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: <Moon className="h-4 w-4" />,
    },
    {
      value: 'system',
      label: 'System',
      icon: <Monitor className="h-4 w-4" />,
    },
  ];

  const currentOption = themeOptions.find((opt) => opt.value === theme);

  if (variant === 'icon') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-9 w-9', className)}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {themeOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                'flex items-center gap-2',
                theme === option.value && 'bg-accent'
              )}
            >
              {option.icon}
              <span>{option.label}</span>
              {theme === option.value && (
                <span className="ml-auto text-xs text-muted-foreground">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Full variant with label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('gap-2', className)}
          aria-label="Toggle theme"
        >
          {currentOption?.icon}
          <span>Theme: {currentOption?.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex items-center gap-2',
              theme === option.value && 'bg-accent'
            )}
          >
            {option.icon}
            <span>{option.label}</span>
            {theme === option.value && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
