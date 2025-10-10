import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { Input } from './input';
import { Label } from './label';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: string) => void;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

export function PromptDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  label,
  placeholder,
  defaultValue = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}: PromptDialogProps): JSX.Element {
  const [value, setValue] = useState(defaultValue);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [open, defaultValue]);

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <div className="py-4">
          {label && (
            <Label htmlFor="prompt-input" className="mb-2">
              {label}
            </Label>
          )}
          <Input
            id="prompt-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={!value.trim()}>
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
