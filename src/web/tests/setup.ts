import '@testing-library/jest-dom/extend-expect'; // v6.1.0
import 'whatwg-fetch'; // v3.6.0
import type { Config } from '@jest/types';

/**
 * Global test setup file for enterprise React application testing
 * Configures testing environment, mocks, and utilities with strict TypeScript typing
 */

// Performance monitoring interface for test execution
interface PerformanceMetrics {
  startTime: number;
  memoryUsage: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
  };
}

/**
 * Initializes comprehensive performance monitoring for test execution
 */
const setupPerformanceMonitoring = (): void => {
  const metrics: PerformanceMetrics = {
    startTime: Date.now(),
    memoryUsage: 0,
    resourceUtilization: {
      cpu: 0,
      memory: 0
    }
  };

  global.performance = {
    ...global.performance,
    mark: (name: string) => {
      metrics.memoryUsage = process.memoryUsage().heapUsed;
      console.debug(`Performance mark: ${name}`, metrics);
    },
    measure: (name: string, startMark: string, endMark: string) => {
      console.debug(`Performance measure: ${name} from ${startMark} to ${endMark}`);
    }
  };
};

/**
 * Implements enterprise-grade IntersectionObserver mock with validation
 */
const setupIntersectionObserverMock = (): void => {
  class IntersectionObserverMock implements IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '0px';
    readonly thresholds: ReadonlyArray<number> = [0];
    private callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback;
      if (options?.threshold) {
        this.validateThresholds(options.threshold);
      }
    }

    private validateThresholds(threshold: number | number[]): void {
      const thresholds = Array.isArray(threshold) ? threshold : [threshold];
      if (thresholds.some(t => t < 0 || t > 1)) {
        throw new Error('Threshold values must be between 0 and 1');
      }
    }

    observe(target: Element): void {
      // Simulate intersection after validation
      setTimeout(() => {
        this.callback([
          {
            target,
            isIntersecting: true,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRatio: 1,
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: Date.now()
          }
        ], this);
      }, 0);
    }

    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  global.IntersectionObserver = IntersectionObserverMock;
};

/**
 * Configures comprehensive global mocks with enterprise features
 */
const setupGlobalMocks = (): void => {
  // Enhanced window object mock
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Advanced ResizeObserver mock
  global.ResizeObserver = class ResizeObserver {
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.callback([{
        target,
        contentRect: target.getBoundingClientRect(),
        borderBoxSize: [{ blockSize: 0, inlineSize: 0 }],
        contentBoxSize: [{ blockSize: 0, inlineSize: 0 }],
        devicePixelContentBoxSize: [{ blockSize: 0, inlineSize: 0 }]
      }], this);
    }

    unobserve(): void {}
    disconnect(): void {}
  };

  // Enterprise-grade localStorage mock
  const localStorageMock = (() => {
    let store: { [key: string]: string } = {};
    return {
      getItem: (key: string): string | null => store[key] || null,
      setItem: (key: string, value: string): void => {
        // Simulate quota exceeded error for large values
        if (Object.keys(store).length >= 100) {
          throw new Error('QuotaExceededError');
        }
        store[key] = value.toString();
      },
      removeItem: (key: string): void => {
        delete store[key];
      },
      clear: (): void => {
        store = {};
      },
      key: (index: number): string | null => {
        return Object.keys(store)[index] || null;
      },
      length: Object.keys(store).length
    };
  })();
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });

  // Advanced fetch mock with network simulation
  global.fetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
    // Simulate network conditions
    const simulateNetworkDelay = () => new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    return simulateNetworkDelay().then(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      blob: async () => new Blob(),
      headers: new Headers(),
    }));
  });
};

// Initialize all mocks and monitoring
setupPerformanceMonitoring();
setupIntersectionObserverMock();
setupGlobalMocks();

// Configure Jest environment
const config: Config.InitialOptions = {
  testEnvironment: 'jsdom',
  setupFiles: ['whatwg-fetch'],
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  testTimeout: 10000,
  maxWorkers: '50%',
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};

export default config;