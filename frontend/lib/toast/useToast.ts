'use client';
import { useState, useCallback } from 'react';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

interface ToastState {
  open: boolean;
  message: string;
  variant: ToastVariant;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: '',
    variant: 'info',
  });

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    setToast({ open: true, message, variant });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, open: false }));
  }, []);

  return { toast, showToast, hideToast };
}
