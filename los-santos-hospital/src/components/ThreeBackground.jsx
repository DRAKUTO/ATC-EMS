import { lazy, Suspense } from 'react';
import ErrorBoundary from './ErrorBoundary';

const ThreeCanvas = lazy(() => import('./ThreeCanvas'));

export default function ThreeBackground() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <ThreeCanvas />
      </Suspense>
    </ErrorBoundary>
  );
}
