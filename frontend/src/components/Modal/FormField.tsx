import React from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ 
  label, 
  required = false, 
  help, 
  error, 
  className = "",
  children 
}: FormFieldProps) {
  return (
    <div className={`form-group ${className}`}>
      <label className={`form-label ${required ? 'form-label--required' : ''}`}>
        {label}
      </label>
      {children}
      {help && <span className="form-help">{help}</span>}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
}

export function TextInput({ label, required, help, error, className = "", ...props }: TextInputProps) {
  return (
    <FormField label={label} required={required} help={help} error={error}>
      <input 
        {...props}
        className={`form-input ${className}`}
        required={required}
      />
    </FormField>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
}

export function TextArea({ label, required, help, error, className = "", ...props }: TextAreaProps) {
  return (
    <FormField label={label} required={required} help={help} error={error}>
      <textarea 
        {...props}
        className={`form-textarea ${className}`}
        required={required}
      />
    </FormField>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export function Select({ 
  label, 
  required, 
  help, 
  error, 
  options, 
  placeholder,
  className = "", 
  ...props 
}: SelectProps) {
  return (
    <FormField label={label} required={required} help={help} error={error}>
      <select 
        {...props}
        className={`form-select ${className}`}
        required={required}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(option => (
          <option 
            key={option.value} 
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({ 
  variant = "primary", 
  loading = false, 
  className = "", 
  disabled,
  children, 
  ...props 
}: ButtonProps) {
  return (
    <button 
      {...props}
      className={`btn btn--${variant} ${loading ? 'btn--loading' : ''} ${className}`}
      disabled={disabled || loading}
    >
      {children}
    </button>
  );
}