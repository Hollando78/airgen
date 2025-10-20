import React from 'react';
import { cn } from '../../lib/utils';
import { AlertCircle } from 'lucide-react';

interface FormFieldProps {
  /**
   * Unique identifier for the input field
   */
  id?: string;

  /**
   * Alternative identifier alias for compatibility
   */
  htmlFor?: string;

  /**
   * Label text
   */
  label: string;

  /**
   * Input element (or custom form control)
   */
  children: React.ReactNode;

  /**
   * Help text displayed below the input
   */
  helpText?: string;

  /**
   * Alias for helpText (legacy usage)
   */
  hint?: string;

  /**
   * Error message (displayed in red with icon)
   */
  error?: string;

  /**
   * Whether the field is required
   */
  required?: boolean;

  /**
   * Additional className for the container
   */
  className?: string;
}

/**
 * FormField - Wrapper component for form inputs
 *
 * Provides consistent styling and structure for form fields including:
 * - Label with required indicator
 * - Help text
 * - Error messages with icon
 * - Proper accessibility attributes
 *
 * @example
 * <FormField
 *   id="email"
 *   label="Email Address"
 *   helpText="We'll never share your email."
 *   error={errors.email}
 *   required
 * >
 *   <Input
 *     id="email"
 *     type="email"
 *     {...register('email')}
 *   />
 * </FormField>
 */
export function FormField({
  id,
  htmlFor,
  label,
  children,
  helpText,
  hint,
  error,
  required = false,
  className,
}: FormFieldProps): JSX.Element {
  const generatedId = React.useId();
  const fieldId = id ?? htmlFor ?? generatedId;
  const resolvedHelpText = helpText ?? hint;
  const helpTextId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label */}
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-foreground"
      >
        {label}
        {required && (
          <span className="ml-1 text-error" aria-label="required">
            *
          </span>
        )}
      </label>

      {/* Input */}
      <div className="relative">
        {React.cloneElement(children as React.ReactElement, {
          id: fieldId,
          'aria-describedby': cn(
            resolvedHelpText && helpTextId,
            error && errorId
          ).trim() || undefined,
          'aria-invalid': error ? true : undefined,
          'aria-required': required,
        })}
      </div>

      {/* Help Text */}
      {resolvedHelpText && !error && (
        <p
          id={helpTextId}
          className="text-sm text-muted-foreground"
        >
          {resolvedHelpText}
        </p>
      )}

      {/* Error Message */}
      {error && (
        <div
          id={errorId}
          className="flex items-start gap-1.5 text-sm text-error"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * FormFieldGroup - Groups multiple related form fields
 *
 * @example
 * <FormFieldGroup legend="Personal Information">
 *   <FormField id="firstName" label="First Name">
 *     <Input id="firstName" />
 *   </FormField>
 *   <FormField id="lastName" label="Last Name">
 *     <Input id="lastName" />
 *   </FormField>
 * </FormFieldGroup>
 */
export function FormFieldGroup({
  legend,
  description,
  children,
  className,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <fieldset className={cn('space-y-6', className)}>
      <legend className="text-lg font-semibold text-foreground mb-1">
        {legend}
      </legend>
      {description && (
        <p className="text-sm text-muted-foreground -mt-1 mb-4">
          {description}
        </p>
      )}
      <div className="space-y-6">
        {children}
      </div>
    </fieldset>
  );
}
