import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  View, 
  Heading, 
  Flex, 
  Button, 
  SkeletonText, 
  Alert,
  SelectField,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Badge,
  Card,
  Text,
  Divider
} from '@aws-amplify/ui-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';

// Types
type DeploymentStrategy = 'BLUE_GREEN' | 'ROLLING' | 'CANARY';
type DeploymentStatus = 'ACTIVE' | 'FAILED' | 'DEPLOYING' | 'STOPPED';
type DeploymentAction = 'START' | 'STOP' | 'ROLLBACK' | 'DELETE';
type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

interface Deployment {
  id: string;
  name: string;
  status: DeploymentStatus;
  health: HealthStatus;
  lastActive: string;
  environment: string;
  metrics: {
    cpu: number;
    memory: number;
    apiCalls: number;
  };
}

interface SystemHealth {
  cpu: number;
  memory: number;
  apiCalls: number;
}

// Component
export const DeploymentListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>(
    searchParams.get('env') || 'production'
  );
  const [deploymentStrategy, setDeploymentStrategy] = useState<DeploymentStrategy>(
    (searchParams.get('strategy') as DeploymentStrategy) || 'BLUE_GREEN'
  );
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    cpu: 0,
    memory: 0,
    apiCalls: 0
  });

  // Virtual list setup for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: deployments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5
  });

  // Handlers
  const handleEnvironmentChange = useCallback((environment: string, strategy: DeploymentStrategy) => {
    setSelectedEnvironment(environment);
    setDeploymentStrategy(strategy);
    setSearchParams({ env: environment, strategy });
    setLoading(true);
    fetchDeployments(environment, strategy);
  }, [setSearchParams]);

  const handleDeploymentAction = useCallback(async (deploymentId: string, action: DeploymentAction) => {
    try {
      setError(null);
      // Implementation would call API endpoint
      await executeDeploymentAction(deploymentId, action);
      fetchDeployments(selectedEnvironment, deploymentStrategy);
    } catch (err) {
      setError(`Failed to execute ${action}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [selectedEnvironment, deploymentStrategy]);

  // Data fetching
  const fetchDeployments = useCallback(async (environment: string, strategy: DeploymentStrategy) => {
    try {
      setLoading(true);
      setError(null);
      // Implementation would call API endpoint
      const response = await fetch(`/api/deployments?env=${environment}&strategy=${strategy}`);
      const data = await response.json();
      setDeployments(data.deployments);
      setSystemHealth(data.systemHealth);
    } catch (err) {
      setError('Failed to fetch deployments');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and refresh
  useEffect(() => {
    fetchDeployments(selectedEnvironment, deploymentStrategy);
    const refreshInterval = setInterval(() => {
      fetchDeployments(selectedEnvironment, deploymentStrategy);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [selectedEnvironment, deploymentStrategy, fetchDeployments]);

  // Render helpers
  const renderHealthBadge = (health: HealthStatus) => {
    const colors = {
      HEALTHY: 'success',
      DEGRADED: 'warning',
      UNHEALTHY: 'error'
    };
    return <Badge variation={colors[health]}>{health}</Badge>;
  };

  const renderMetricsBar = (value: number) => (
    <View width="100px" height="8px" backgroundColor="rgba(0,0,0,0.1)" borderRadius="4px">
      <View 
        width={`${value}%`} 
        height="100%" 
        backgroundColor="blue.600" 
        borderRadius="4px"
        transition="width 0.3s ease"
      />
    </View>
  );

  // Main render
  return (
    <View
      as="main"
      padding={{ base: '1rem', medium: '2rem' }}
      role="main"
      aria-labelledby="page-title"
    >
      <Flex direction="column" gap="1.5rem">
        {/* Header */}
        <Flex justifyContent="space-between" alignItems="center">
          <Heading level={1} id="page-title">Active Deployments</Heading>
          <SelectField
            label="Environment"
            value={selectedEnvironment}
            onChange={(e) => handleEnvironmentChange(e.target.value, deploymentStrategy)}
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </SelectField>
        </Flex>

        {/* Error display */}
        {error && (
          <Alert variation="error" dismissible={true}>
            {error}
          </Alert>
        )}

        {/* System Health */}
        <Card>
          <Heading level={3}>System Health</Heading>
          <Flex direction="column" gap="1rem">
            <Flex alignItems="center" gap="1rem">
              <Text>CPU: {systemHealth.cpu}%</Text>
              {renderMetricsBar(systemHealth.cpu)}
            </Flex>
            <Flex alignItems="center" gap="1rem">
              <Text>Memory: {systemHealth.memory}%</Text>
              {renderMetricsBar(systemHealth.memory)}
            </Flex>
            <Flex alignItems="center" gap="1rem">
              <Text>API Calls: {systemHealth.apiCalls}%</Text>
              {renderMetricsBar(systemHealth.apiCalls)}
            </Flex>
          </Flex>
        </Card>

        {/* Deployments Table */}
        <View ref={parentRef} height="600px" overflow="auto">
          {loading ? (
            <Flex direction="column" gap="1rem">
              {[...Array(5)].map((_, i) => (
                <SkeletonText key={i} width="100%" lines={3} />
              ))}
            </Flex>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell as="th">Agent Name</TableCell>
                  <TableCell as="th">Status</TableCell>
                  <TableCell as="th">Health</TableCell>
                  <TableCell as="th">Last Active</TableCell>
                  <TableCell as="th">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const deployment = deployments[virtualRow.index];
                  return (
                    <TableRow
                      key={deployment.id}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <TableCell>{deployment.name}</TableCell>
                      <TableCell>
                        <Badge variation={deployment.status === 'ACTIVE' ? 'success' : 'warning'}>
                          {deployment.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{renderHealthBadge(deployment.health)}</TableCell>
                      <TableCell>{deployment.lastActive}</TableCell>
                      <TableCell>
                        <Flex gap="0.5rem">
                          <Button
                            size="small"
                            onClick={() => handleDeploymentAction(deployment.id, 'START')}
                            isDisabled={deployment.status === 'ACTIVE'}
                          >
                            Start
                          </Button>
                          <Button
                            size="small"
                            variation="warning"
                            onClick={() => handleDeploymentAction(deployment.id, 'STOP')}
                            isDisabled={deployment.status !== 'ACTIVE'}
                          >
                            Stop
                          </Button>
                          <Button
                            size="small"
                            variation="error"
                            onClick={() => handleDeploymentAction(deployment.id, 'DELETE')}
                          >
                            Delete
                          </Button>
                        </Flex>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </View>
      </Flex>
    </View>
  );
};

// Helper function (implementation would be in a separate service)
async function executeDeploymentAction(deploymentId: string, action: DeploymentAction): Promise<void> {
  const response = await fetch(`/api/deployments/${deploymentId}/${action.toLowerCase()}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Failed to execute ${action}`);
  }
}