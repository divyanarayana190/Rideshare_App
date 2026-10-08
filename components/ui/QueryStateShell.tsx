import { useNetworkStatus } from "@/hooks/use-network-status";
import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

interface Props {
  isLoading: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  children: ReactNode;
  compact?: boolean;
}

/** Shared loading / error / empty / offline shell for data screens. */
export function QueryStateShell({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  loadingMessage,
  errorTitle,
  errorMessage,
  emptyTitle = "Nothing here yet",
  emptySubtitle,
  emptyActionLabel,
  onEmptyAction,
  children,
  compact,
}: Props) {
  const { isOffline } = useNetworkStatus();

  if (isLoading) return <LoadingState message={loadingMessage} compact={compact} />;

  if (isOffline && isError) {
    return (
      <ErrorState
        title="You're offline"
        message="Reconnect to load this screen."
        onRetry={onRetry}
      />
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={errorTitle ?? "Could not load data"}
        message={errorMessage ?? "Check your connection and try again."}
        onRetry={onRetry}
      />
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        subtitle={emptySubtitle}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return <>{children}</>;
}
