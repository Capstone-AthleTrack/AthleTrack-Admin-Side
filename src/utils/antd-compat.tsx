/**
 * Ant Design + React 19 Compatibility Utilities
 * 
 * React 19 has changes to how refs and form state work.
 * This module provides utilities to ensure Ant Design forms work correctly.
 * 
 * @see https://u.ant.design/v5-for-19
 */

import { useEffect, useRef, useCallback } from 'react';
import type { FormInstance } from 'antd';

/**
 * Hook to safely get form field value with React 19 compatibility
 * Uses a ref-based approach to avoid stale closures
 */
export function useFormFieldValue<T = unknown>(
  form: FormInstance,
  fieldName: string | (string | number)[],
  defaultValue?: T
): T {
  const valueRef = useRef<T>(defaultValue as T);
  
  useEffect(() => {
    const value = form.getFieldValue(fieldName);
    if (value !== undefined) {
      valueRef.current = value;
    }
  }, [form, fieldName]);
  
  return valueRef.current;
}

/**
 * Hook to force form re-validation on mount
 * Helps with React 19's stricter effect handling
 */
export function useFormValidationOnMount(form: FormInstance, fields?: string[]) {
  useEffect(() => {
    // Small delay to ensure form is fully mounted
    const timer = setTimeout(() => {
      if (fields && fields.length > 0) {
        form.validateFields(fields).catch(() => {
          // Ignore validation errors on mount
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [form, fields]);
}

/**
 * Hook to handle form submission with proper React 19 event handling
 */
export function useFormSubmit<T>(
  form: FormInstance<T>,
  onSubmit: (values: T) => Promise<void> | void
) {
  const submittingRef = useRef(false);
  
  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    
    try {
      submittingRef.current = true;
      const values = await form.validateFields();
      await onSubmit(values);
    } catch (error) {
      // Validation failed or submission error
      console.debug('[Form] Validation or submission error:', error);
    } finally {
      submittingRef.current = false;
    }
  }, [form, onSubmit]);
  
  return handleSubmit;
}

/**
 * Wrapper to ensure form values are properly initialized
 * Call this in useEffect after form is created
 */
export function initializeFormValues<T extends object>(
  form: FormInstance<T>,
  initialValues: Partial<T>
) {
  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    form.setFieldsValue(initialValues as T);
  });
}

/**
 * Safe form reset that works with React 19
 */
export function safeFormReset(form: FormInstance) {
  // Reset in next tick to avoid React 19 batching issues
  setTimeout(() => {
    form.resetFields();
  }, 0);
}

/**
 * Get form values safely with fallback
 */
export function getFormValues<T extends object>(
  form: FormInstance<T>,
  fallback: T
): T {
  try {
    const values = form.getFieldsValue();
    return { ...fallback, ...values };
  } catch {
    return fallback;
  }
}

