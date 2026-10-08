import { useToastStore } from '@/lib/stores';

/**
 * Centralized notification hook for YOO.
 *
 * Loading pattern:
 *   const id = showLoading("Posting ride...");
 *   try { ...; dismiss(id); showSuccess("🚗 Ride posted!"); }
 *   catch(e) { dismiss(id); showError(e.message); }
 */
export function useNotification() {
  const store = useToastStore();
  return {
    showSuccess: (message: string) => store.show(message, 'success'),
    showError:   (message: string) => store.show(message, 'error'),
    showInfo:    (message: string) => store.show(message, 'info'),
    showWarning: (message: string) => store.show(message, 'warning'),
    /** Returns the toast id — call dismiss(id) when the async operation completes. */
    showLoading: (message: string) => store.showLoading(message),
    dismiss:     (id: string)      => store.dismiss(id),
  };
}
