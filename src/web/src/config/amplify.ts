/**
 * AWS Amplify configuration file for the Agent Builder Hub frontend application.
 * Implements secure authentication flow, API communication, and monitoring capabilities.
 * @version 1.0.0
 */

import { Amplify, Hub } from '@aws-amplify/core'; // v6.0.0
import { Auth } from '@aws-amplify/auth'; // v6.0.0
import { API } from '@aws-amplify/api'; // v6.0.0
import { API_VERSION } from './api';

// Core configuration constants
const REGION = process.env.REACT_APP_AWS_REGION;
const USER_POOL_ID = process.env.REACT_APP_USER_POOL_ID;
const USER_POOL_WEB_CLIENT_ID = process.env.REACT_APP_USER_POOL_WEB_CLIENT_ID;
const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000;

/**
 * Validates that all required environment variables are present
 * @throws Error if any required environment variable is missing
 */
const validateEnvironmentVariables = (): boolean => {
  const requiredVars = [
    { name: 'REACT_APP_AWS_REGION', value: REGION },
    { name: 'REACT_APP_USER_POOL_ID', value: USER_POOL_ID },
    { name: 'REACT_APP_USER_POOL_WEB_CLIENT_ID', value: USER_POOL_WEB_CLIENT_ID },
    { name: 'REACT_APP_API_ENDPOINT', value: API_ENDPOINT }
  ];

  for (const { name, value } of requiredVars) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }

  return true;
};

/**
 * Configures authentication event monitoring through Amplify Hub
 */
const configureAuthMonitoring = (): void => {
  Hub.listen('auth', ({ payload: { event, data } }) => {
    switch (event) {
      case 'signIn':
        console.info('User signed in successfully', { userId: data.username });
        break;
      case 'signOut':
        console.info('User signed out');
        break;
      case 'signIn_failure':
        console.error('User sign in failed', { error: data });
        break;
      case 'tokenRefresh':
        console.debug('Token refresh completed');
        break;
      case 'tokenRefresh_failure':
        console.error('Token refresh failed', { error: data });
        break;
    }
  });
};

/**
 * Returns the complete AWS Amplify configuration object
 * @returns Complete Amplify configuration with auth, API, and monitoring settings
 */
export const getAmplifyConfig = () => {
  validateEnvironmentVariables();

  return {
    Auth: {
      region: REGION,
      userPoolId: USER_POOL_ID,
      userPoolWebClientId: USER_POOL_WEB_CLIENT_ID,
      mandatorySignIn: true,
      cookieStorage: {
        domain: window.location.hostname,
        path: '/',
        expires: 365,
        secure: true,
        sameSite: 'strict'
      },
      authenticationFlowType: 'USER_SRP_AUTH',
      oauth: {
        scope: ['email', 'openid', 'profile'],
        responseType: 'code'
      },
      mfa: {
        enable: true,
        preferred: 'TOTP'
      }
    },
    API: {
      endpoints: [
        {
          name: 'AgentBuilderAPI',
          endpoint: API_ENDPOINT,
          region: REGION,
          custom_header: async () => {
            try {
              const session = await Auth.currentSession();
              return {
                Authorization: `Bearer ${session.getIdToken().getJwtToken()}`,
                'X-Api-Version': API_VERSION,
                'X-Request-ID': crypto.randomUUID(),
                'Content-Type': 'application/json'
              };
            } catch (error) {
              console.error('Error getting session:', error);
              return {};
            }
          }
        }
      ],
      defaultConfig: {
        maxRetries: MAX_RETRIES,
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Security-Policy': "default-src 'self'",
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block'
        }
      }
    }
  };
};

// Initialize Amplify configuration
const amplifyConfig = getAmplifyConfig();
Amplify.configure(amplifyConfig);
configureAuthMonitoring();

// Export configured Amplify instance and configuration getter
export { amplifyConfig };