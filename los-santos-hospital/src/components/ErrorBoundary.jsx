import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          background: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '12px',
          color: '#991b1b',
          fontFamily: 'monospace',
          fontSize: '14px',
          textAlign: 'right',
          direction: 'rtl',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ حدث خطأ</h2>
          <pre>{this.state.error?.message}</pre>
          <pre style={{ fontSize: '12px', marginTop: '8px', color: '#666' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
