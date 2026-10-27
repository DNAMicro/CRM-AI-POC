"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  /** When true, renders a compact inline fallback instead of the full card */
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const message = this.props.fallbackMessage || "Something went wrong";

      if (this.props.compact) {
        return (
          <div className="my-2 px-3 py-2.5 rounded-xl bg-red-50/80 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/30 flex items-center gap-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            <span className="text-[12px] text-red-700/80 dark:text-red-400/80 flex-1">{message}</span>
            <button
              onClick={this.handleReset}
              className="text-[11px] text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        );
      }

      return (
        <div className="my-4 p-5 rounded-xl glass-card border border-red-200/40 dark:border-red-800/30">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-red-800 dark:text-red-400">{message}</p>
              {this.state.error && (
                <p className="text-[11px] text-red-600/70 mt-1 font-mono truncate">
                  {this.state.error.message}
                </p>
              )}
              <button
                onClick={this.handleReset}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-red-700 bg-red-100/80 hover:bg-red-200/80 dark:text-red-400 dark:bg-red-950/40 dark:hover:bg-red-900/40 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
