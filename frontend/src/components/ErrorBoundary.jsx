import { Component } from 'react';

/**
 * Catches render errors below it and shows a fallback instead of a blank page.
 * Change `resetKey` (e.g. the active screen) to clear a previous error automatically.
 * Note: error boundaries do not catch async API errors; those are handled where they are fetched.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error) { return { error }; }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { resetKey: props.resetKey, error: null } : null;
  }

  componentDidCatch(error, info) {
    console.error('UI error caught by ErrorBoundary:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
        <p className="text-sm font-bold">{this.props.title || 'This section could not be displayed.'}</p>
        <p className="mt-1 text-xs text-rose-700">Your data is safe. Try again, or reload the page if it keeps happening.</p>
        <button type="button" onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100">
          Try again
        </button>
      </div>
    );
  }
}
