"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Auth Component Error:", error, errorInfo);
  }

  handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = `/api/auth/reset?redirect=${encodeURIComponent(window.location.pathname)}`;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Session Refresh Needed</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              A previous expired session was detected in your browser cookies. Click below to clear it and log in.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-white text-xs font-semibold shadow-lg shadow-primary/25 hover:opacity-90 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Reset & Open Clean Sign In
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
