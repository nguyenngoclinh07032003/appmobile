import React from 'react';
import { AppProvider } from './src/context';
import AppNavigator from './src/navigation/AppNavigator';
import { ErrorBoundary } from './src/components';

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppNavigator />
      </AppProvider>
    </ErrorBoundary>
  );
}
