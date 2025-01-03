# Agent Builder Hub Web Application

Enterprise-grade React application for creating and managing AI-powered automation agents.

## Overview

The Agent Builder Hub web application provides an intuitive interface for creating, managing, and deploying AI agents across the organization. Built with React 18.2+ and TypeScript 5.0+, it implements AWS Amplify UI components following Material Design 3.0 principles.

### Key Features
- Template-based agent creation
- Knowledge base integration
- Real-time agent testing
- Enterprise deployment management
- Role-based access control
- Comprehensive monitoring

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Docker Desktop (latest version)
- VS Code with recommended extensions:
  - ESLint
  - Prettier
  - TypeScript and JavaScript Language Features
  - Docker
  - GitLens
  - AWS Toolkit

## Getting Started

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd src/web
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env.local
```

4. Start development server:
```bash
npm run dev
```

### Development Environment

#### Docker Setup

1. Build development container:
```bash
docker-compose up --build
```

2. Access development server:
```
http://localhost:3000
```

#### Environment Configuration

Development environment variables (.env.local):
```
REACT_APP_API_ENDPOINT=http://localhost:8000
REACT_APP_COGNITO_REGION=us-east-1
REACT_APP_USER_POOL_ID=<your-user-pool-id>
REACT_APP_USER_POOL_CLIENT_ID=<your-client-id>
```

## Development Guidelines

### Code Style

We follow strict TypeScript and React best practices enforced through ESLint and Prettier.

```bash
# Run linter
npm run lint

# Run formatter
npm run format
```

### Component Development

#### AWS Amplify UI Components

```typescript
import { Button, Card, TextField } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
```

#### Custom Component Template

```typescript
import React from 'react';
import { ComponentProps } from '@aws-amplify/ui-react';

interface CustomComponentProps extends ComponentProps {
  // Add custom props
}

export const CustomComponent: React.FC<CustomComponentProps> = (props) => {
  // Component implementation
};
```

### State Management

Using Redux Toolkit for global state management:

```typescript
import { configureStore } from '@reduxjs/toolkit';
import { agentSlice } from './slices/agentSlice';

export const store = configureStore({
  reducer: {
    agents: agentSlice.reducer,
  },
});
```

### Testing

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage
```

### Accessibility

- Implement ARIA labels and roles
- Ensure keyboard navigation
- Maintain color contrast ratios
- Support screen readers
- Provide text alternatives

## Security

### Authentication

AWS Cognito integration:

```typescript
import { Authenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: process.env.REACT_APP_COGNITO_REGION,
    userPoolId: process.env.REACT_APP_USER_POOL_ID,
    userPoolWebClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
  },
});
```

### Authorization

Role-based access control implementation:

```typescript
import { useAuthenticator } from '@aws-amplify/ui-react';

const { user } = useAuthenticator();
const userGroups = user?.getSignInUserSession()?.getAccessToken()?.payload['cognito:groups'] || [];
```

### Data Protection

- Use HTTPS for all API communications
- Implement CSP headers
- Sanitize user inputs
- Encrypt sensitive data in transit
- Implement session timeout

## Deployment

### Development

```bash
npm run build:dev
```

### Staging

```bash
npm run build:staging
```

### Production

```bash
npm run build:prod
```

#### AWS Amplify Deployment

1. Configure Amplify:
```bash
amplify configure
```

2. Initialize project:
```bash
amplify init
```

3. Push changes:
```bash
amplify push
```

## Project Structure

```
src/
├── components/
│   ├── agents/
│   ├── knowledge/
│   ├── deployment/
│   └── shared/
├── hooks/
├── pages/
├── services/
├── store/
├── styles/
├── types/
└── utils/
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build production bundle
- `npm run test` - Run test suite
- `npm run lint` - Run ESLint
- `npm run format` - Run Prettier
- `npm run analyze` - Analyze bundle size

## Contributing

1. Create feature branch
2. Implement changes
3. Write tests
4. Submit pull request
5. Await code review

## Maintenance

- Regular dependency updates
- Security patch management
- Performance monitoring
- Accessibility audits
- Code quality reviews

## Support

Contact the frontend development team for:
- Development issues
- Configuration help
- Deployment assistance
- Security concerns

## License

Proprietary - Hakkoda, Inc.