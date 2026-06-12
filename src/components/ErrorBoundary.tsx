import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { logger } from "../lib/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  resetCount: number;
  lastResetTime: number;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  declare props: Readonly<ErrorBoundaryProps>;
  declare state: Readonly<ErrorBoundaryState>;
  declare setState: React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
  >["setState"];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      resetCount: 0,
      lastResetTime: 0,
    };
    this.handleGlobalError = this.handleGlobalError.bind(this);
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this);
    this.handleReset = this.handleReset.bind(this);
    this.handleGoHome = this.handleGoHome.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    logger.error(
      `Error in ${this.props.componentName || "component"}`,
      error,
      errorInfo,
    );

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidMount(): void {
    // Only attach global error handlers if this is the root boundary
    // (no componentName means it's likely root, but we use a specific name check).
    // This prevents duplicate logging when multiple ErrorBoundary instances exist.
    if (!ErrorBoundary._globalHandlerAttached) {
      ErrorBoundary._globalHandlerAttached = true;
      this._ownsGlobalHandlers = true;
      window.addEventListener("error", this.handleGlobalError);
      window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
    }
  }

  componentWillUnmount(): void {
    if (this._ownsGlobalHandlers) {
      window.removeEventListener("error", this.handleGlobalError);
      window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
      ErrorBoundary._globalHandlerAttached = false;
      this._ownsGlobalHandlers = false;
    }
  }

  private _ownsGlobalHandlers = false;
  private static _globalHandlerAttached = false;

  handleGlobalError(event: ErrorEvent): void {
    const error = event.error;
    if (!error) return;

    // Only log global errors — do NOT show the full-page crash UI for them.
    // Global errors include things like third-party script failures, network
    // errors, browser extension issues, etc. that are often non-fatal.
    // React component errors are already caught by getDerivedStateFromError.
    logger.error(
      `Global error caught in ${this.props.componentName || "component"}`,
      error,
    );

    if (this.props.onError) {
      this.props.onError(error, { componentStack: "" });
    }
  }

  handleUnhandledRejection(event: PromiseRejectionEvent): void {
    const reason = event.reason;
    const error =
      reason instanceof Error ? reason : new Error(String(reason ?? "Unhandled promise rejection"));

    logger.error(
      `Unhandled rejection in ${this.props.componentName || "component"}`,
      error,
    );

    if (this.props.onError) {
      this.props.onError(error, { componentStack: "" });
    }
  }

  // Maximum resets allowed within the cooldown window before we stop retrying
  private static readonly MAX_RESETS = 3;
  private static readonly RESET_COOLDOWN_MS = 10_000; // 10 seconds

  handleReset(): void {
    const now = Date.now();
    const { resetCount, lastResetTime } = this.state;

    // Reset the counter if we're outside the cooldown window
    const effectiveCount =
      now - lastResetTime > ErrorBoundary.RESET_COOLDOWN_MS ? 0 : resetCount;

    if (effectiveCount >= ErrorBoundary.MAX_RESETS) {
      logger.warn(
        `Error boundary reset limit reached for ${this.props.componentName || "component"} — refusing reset to prevent infinite loop`,
      );
      return;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      resetCount: effectiveCount + 1,
      lastResetTime: now,
    });
    logger.info(
      `Error boundary reset for ${this.props.componentName || "component"} (${effectiveCount + 1}/${ErrorBoundary.MAX_RESETS})`,
    );
  }

  handleGoHome(): void {
    window.location.href = "/";
  }

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, componentName } = this.props;

    if (hasError) {
      if (fallback) {
        return <>{fallback}</>;
      }

      return (
        <div className="min-h-screen bg-linear-to-b from-neutral-950 to-black text-white p-8 flex items-center justify-center">
          <div className="max-w-2xl w-full bg-neutral-900/80 backdrop-blur-lg rounded-2xl border border-red-500/30 p-8 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Something went wrong</h1>
                <p className="text-neutral-400 text-sm">
                  {componentName
                    ? `Error in ${componentName}`
                    : "Component error"}
                </p>
              </div>
            </div>

            <div className="bg-black/50 rounded-lg p-4 mb-6 font-mono text-sm">
              <div className="text-red-400 font-bold mb-2">
                {error?.name || "Error"}
              </div>
              <div className="text-neutral-300 mb-2">
                {error?.message || "Unknown error"}
              </div>

              {errorInfo?.componentStack && (
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">
                    Component Stack:
                  </div>
                  <pre className="text-neutral-400 text-xs overflow-auto max-h-40">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                <RefreshCw size={18} />
                Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                className="flex-1 flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                <Home size={18} />
                Go to Home
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-neutral-800">
              <p className="text-neutral-500 text-sm">
                If the problem persists, please report this issue with the error
                details above.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return <>{children}</>;
  }
}

// Higher-order component for wrapping components with error boundaries
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string,
  fallback?: ReactNode,
): React.ComponentType<P> {
  const displayName =
    componentName ||
    WrappedComponent.displayName ||
    WrappedComponent.name ||
    "Component";

  const WithBoundary: React.FC<P> = (props) => (
    <ErrorBoundary componentName={displayName} fallback={fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithBoundary.displayName = `WithErrorBoundary(${displayName})`;

  return WithBoundary;
}

// Hook for error handling in functional components
export function useErrorHandler() {
  const handleError = React.useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      logger.error("Component error", error, context);

      // In development, re-throw asynchronously to trigger the error overlay
      // without crashing the synchronous call site (callers expect fire-and-forget)
      if (process.env.NODE_ENV === "development") {
        setTimeout(() => { throw error; }, 0);
      }
    },
    [],
  );

  return { handleError };
}
