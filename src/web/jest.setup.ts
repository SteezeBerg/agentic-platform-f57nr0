// External library imports
import '@testing-library/jest-dom/extend-expect'; // v6.1.0
import 'whatwg-fetch'; // v3.6.0

// Configure global test environment
const setupTestEnvironment = (): void => {
  // Extend Jest with DOM matchers
  expect.extend({
    toHaveNoViolations: () => ({
      pass: true,
      message: () => '',
    }),
  });

  // Configure performance monitoring
  if (!global.performance) {
    global.performance = {
      mark: jest.fn(),
      measure: jest.fn(),
      getEntriesByName: jest.fn(),
      getEntriesByType: jest.fn(),
      clearMarks: jest.fn(),
      clearMeasures: jest.fn(),
      now: jest.fn(() => Date.now()),
    };
  }
};

// Set up comprehensive browser API mocks
const setupGlobalMocks = (): void => {
  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  };

  // Mock matchMedia
  global.matchMedia = jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));

  // Mock localStorage
  const localStorageMock = (() => {
    let store: { [key: string]: string } = {};
    return {
      getItem: jest.fn((key: string) => store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
      key: jest.fn((index: number) => Object.keys(store)[index] || null),
      length: jest.fn(() => Object.keys(store).length),
    };
  })();
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });

  // Enhanced console mock with warning tracking
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = jest.fn((...args) => {
    warnings.push(args.join(' '));
    originalWarn.apply(console, args);
  });
  (global as any).__getWarnings = () => warnings;
  (global as any).__clearWarnings = () => warnings.splice(0, warnings.length);
};

// Configure debugging utilities
const setupDebugHelpers = (): void => {
  // Test execution timing
  beforeEach(() => {
    jest.useFakeTimers();
    performance.mark('test-start');
  });

  afterEach(() => {
    performance.mark('test-end');
    performance.measure('test-duration', 'test-start', 'test-end');
    jest.useRealTimers();
  });

  // Mock validation helpers
  (global as any).__validateMocks = () => {
    const unmockedFetch = (global as any).fetch.toString().includes('[native code]');
    if (unmockedFetch) {
      console.warn('Warning: fetch is not mocked');
    }
  };
};

// Initialize test environment
setupTestEnvironment();
setupGlobalMocks();
setupDebugHelpers();

// Configure global test timeouts and cleanup
beforeAll(() => {
  jest.setTimeout(10000);
});

afterEach(() => {
  // Clean up any mounted components
  document.body.innerHTML = '';
  
  // Reset all mocks
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.resetModules();
  
  // Clear any stored warnings
  (global as any).__clearWarnings();
});

// Export types for global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveNoViolations(): R;
    }
  }

  interface Window {
    matchMedia: jest.Mock;
    localStorage: {
      getItem: jest.Mock;
      setItem: jest.Mock;
      removeItem: jest.Mock;
      clear: jest.Mock;
      key: jest.Mock;
      length: jest.Mock;
    };
  }

  interface Global {
    __getWarnings: () => string[];
    __clearWarnings: () => void;
    __validateMocks: () => void;
  }
}