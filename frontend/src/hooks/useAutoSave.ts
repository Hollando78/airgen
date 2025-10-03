import { useEffect, useCallback, useRef } from "react";

export interface UseAutoSaveOptions {
  key: string;
  content: string;
  onSave?: (content: string) => void | Promise<void>;
  debounceMs?: number;
}

/**
 * Auto-save hook with localStorage and debouncing
 * Saves content to localStorage after user stops typing
 */
export function useAutoSave({ key, content, onSave, debounceMs = 1000 }: UseAutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousContentRef = useRef(content);

  // Load draft from localStorage on mount
  const loadDraft = useCallback(() => {
    try {
      const draft = localStorage.getItem(key);
      if (draft) {
        const parsed = JSON.parse(draft);
        return {
          content: parsed.content,
          timestamp: new Date(parsed.timestamp)
        };
      }
    } catch (error) {
      console.error("Failed to load draft:", error);
    }
    return null;
  }, [key]);

  // Save to localStorage
  const saveDraft = useCallback((contentToSave: string) => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          content: contentToSave,
          timestamp: new Date().toISOString()
        })
      );
    } catch (error) {
      console.error("Failed to save draft:", error);
    }
  }, [key]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error("Failed to clear draft:", error);
    }
  }, [key]);

  // Debounced auto-save effect
  useEffect(() => {
    // Skip if content hasn't changed
    if (content === previousContentRef.current) {
      return;
    }

    previousContentRef.current = content;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for auto-save
    timeoutRef.current = setTimeout(() => {
      saveDraft(content);
      onSave?.(content);
    }, debounceMs);

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, debounceMs, onSave, saveDraft]);

  return {
    loadDraft,
    saveDraft,
    clearDraft
  };
}
