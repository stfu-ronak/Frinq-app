import React from 'react';
import { ErrorState } from '../design/components/ErrorState';
import { reportHandledError, logBreadcrumb } from '../services/telemetry/crashReporter';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

/** Catches render/runtime errors, reports a redacted error (no PII/content),
 *  and shows a recoverable ErrorState instead of a white screen. */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Only the error name/message-as-code — never component props or content.
    logBreadcrumb('react_error_boundary');
    reportHandledError(error.name || 'render_error');
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          message="The app hit an unexpected problem. You can try again."
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
