import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Heading, Text, Flex, Divider } from '@aws-amplify/ui-react'; // v6.0.0
import debounce from 'lodash/debounce'; // v4.17.21
import { Button } from '../common/Button';
import { CodeEditor } from '../common/CodeEditor';
import { useAgent } from '../../hooks/useAgent';
import ErrorBoundary from '../common/ErrorBoundary';
import { LoadingState } from '../../types/common';
import { AgentStatus } from '../../types/agent';

// Constants for accessibility and performance
const DEBOUNCE_DELAY = 300;
const AUTO_SAVE_DELAY = 1000;
const MAX_RESPONSE_LENGTH = 10000;

interface TestConsoleProps {
  agentId: string;
  onSaveTest?: (testCase: TestCase) => Promise<void>;
  onError?: (error: Error) => void;
}

interface TestCase {
  input: string;
  response: string;
  timestamp: string;
  metadata: {
    executionTime: number;
    tokenCount: number;
    status: string;
  };
}

/**
 * Enterprise-grade test console component for real-time agent testing
 * Implements AWS Amplify UI design patterns with Material Design 3.0 principles
 */
const TestConsole: React.FC<TestConsoleProps> = React.memo(({
  agentId,
  onSaveTest,
  onError
}) => {
  // State management
  const [input, setInput] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({});
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [executionTime, setExecutionTime] = useState<number>(0);

  // Custom hooks
  const { agent, updateAgent } = useAgent(agentId);

  // Memoized styles based on theme tokens
  const styles = useMemo(() => ({
    container: {
      padding: '1rem',
      backgroundColor: 'var(--amplify-colors-background-secondary)',
      borderRadius: 'var(--amplify-radii-medium)',
      boxShadow: 'var(--amplify-shadows-medium)'
    },
    responsePanel: {
      backgroundColor: 'var(--amplify-colors-background-tertiary)',
      padding: '1rem',
      borderRadius: 'var(--amplify-radii-small)',
      minHeight: '200px',
      maxHeight: '400px',
      overflowY: 'auto' as const
    },
    debugPanel: {
      backgroundColor: 'var(--amplify-colors-background-quaternary)',
      padding: '0.5rem',
      borderRadius: 'var(--amplify-radii-small)',
      fontSize: 'var(--amplify-font-sizes-small)'
    }
  }), []);

  // Debounced test execution handler
  const debouncedTestExecution = useCallback(
    debounce(async (testInput: string) => {
      if (!agent || !testInput.trim()) return;

      try {
        setLoadingState(LoadingState.LOADING);
        const startTime = performance.now();

        // Execute agent test with timeout
        const testPromise = new Promise(async (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Test execution timeout'));
          }, 30000);

          try {
            const result = await fetch(`/api/agents/${agentId}/test`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input: testInput })
            });

            if (!result.ok) throw new Error('Test execution failed');
            
            const data = await result.json();
            clearTimeout(timeout);
            resolve(data);
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        });

        const testResult = await testPromise;
        const endTime = performance.now();

        // Update response and metrics
        setResponse(testResult.response.slice(0, MAX_RESPONSE_LENGTH));
        setExecutionTime(endTime - startTime);
        setDebugInfo({
          tokenCount: testResult.metrics.tokenCount,
          modelName: testResult.metrics.modelName,
          latency: Math.round(endTime - startTime),
          timestamp: new Date().toISOString()
        });

        // Save test case if callback provided
        if (onSaveTest) {
          const testCase: TestCase = {
            input: testInput,
            response: testResult.response,
            timestamp: new Date().toISOString(),
            metadata: {
              executionTime: endTime - startTime,
              tokenCount: testResult.metrics.tokenCount,
              status: LoadingState.SUCCESS
            }
          };
          await onSaveTest(testCase);
        }

        setLoadingState(LoadingState.SUCCESS);
      } catch (error) {
        setLoadingState(LoadingState.ERROR);
        setDebugInfo(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }));
        if (onError && error instanceof Error) {
          onError(error);
        }
      }
    }, DEBOUNCE_DELAY),
    [agent, agentId, onSaveTest, onError]
  );

  // Handle input changes
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    debouncedTestExecution(value);
  }, [debouncedTestExecution]);

  // Reset console state
  const handleReset = useCallback(() => {
    setInput('');
    setResponse('');
    setDebugInfo({});
    setLoadingState(LoadingState.IDLE);
    setExecutionTime(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedTestExecution.cancel();
    };
  }, [debouncedTestExecution]);

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <Heading level={3} isTruncated>
          Agent Testing Console
        </Heading>
        
        <Flex direction="column" gap="medium">
          {/* Input Section */}
          <View>
            <Text>Input Parameters</Text>
            <CodeEditor
              value={input}
              onChange={handleInputChange}
              language="json"
              height="200px"
              readOnly={loadingState === LoadingState.LOADING || agent?.status !== AgentStatus.READY}
            />
          </View>

          <Divider />

          {/* Response Section */}
          <View>
            <Text>Response Preview</Text>
            <View style={styles.responsePanel}>
              <Text
                variation={loadingState === LoadingState.ERROR ? 'error' : undefined}
                fontFamily="Monaco, monospace"
              >
                {loadingState === LoadingState.LOADING ? 'Processing...' : response}
              </Text>
            </View>
          </View>

          {/* Debug Information */}
          <View>
            <Text>Debug Information</Text>
            <View style={styles.debugPanel}>
              <pre>
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </View>
          </View>

          {/* Action Buttons */}
          <Flex justifyContent="flex-end" gap="small">
            <Button
              onClick={handleReset}
              variant="secondary"
              isDisabled={loadingState === LoadingState.LOADING}
              ariaLabel="Reset test console"
            >
              Reset
            </Button>
            <Button
              onClick={() => debouncedTestExecution(input)}
              variant="primary"
              isLoading={loadingState === LoadingState.LOADING}
              isDisabled={!input.trim() || agent?.status !== AgentStatus.READY}
              ariaLabel="Execute test"
            >
              Test
            </Button>
          </Flex>
        </Flex>
      </View>
    </ErrorBoundary>
  );
});

TestConsole.displayName = 'TestConsole';

export default TestConsole;