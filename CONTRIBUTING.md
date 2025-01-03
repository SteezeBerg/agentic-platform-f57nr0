# Contributing to Agent Builder Hub

## Table of Contents
- [Introduction](#introduction)
  - [Project Vision](#project-vision)
  - [Code of Conduct](#code-of-conduct)
  - [Getting Started](#getting-started)
- [Development Environment](#development-environment)
  - [Required Tools](#required-tools)
  - [Environment Setup](#environment-setup)
  - [IDE Configuration](#ide-configuration)
- [Development Workflow](#development-workflow)
  - [Branch Naming](#branch-naming)
  - [Commit Messages](#commit-messages)
  - [Pull Requests](#pull-requests)
  - [Code Review](#code-review)
- [Code Standards](#code-standards)
  - [Python Standards](#python-standards)
  - [TypeScript Standards](#typescript-standards)
  - [Documentation](#documentation)
  - [Testing Requirements](#testing-requirements)

## Introduction

### Project Vision
The Agent Builder Hub aims to democratize AI-powered automation solutions within Hakkoda by enabling both technical and non-technical staff to create custom agents and copilots. Our platform reduces project timelines from months to weeks while maintaining enterprise-grade security and scalability.

### Code of Conduct
Contributors must adhere to professional conduct guidelines:
- Maintain confidentiality of enterprise data
- Follow security protocols for all code changes
- Respect intellectual property rights
- Collaborate professionally with team members
- Report security concerns immediately

### Getting Started
1. Request access to the repository
2. Set up development environment
3. Review documentation
4. Start with small, well-defined tasks

## Development Environment

### Required Tools
- Python 3.11+
- Node.js 18.x
- Docker Desktop (latest)
- AWS CDK 2.0+
- Git (latest)
- VS Code or PyCharm
- Security tools:
  - Bandit
  - Safety
  - SonarQube Scanner

### Environment Setup
1. Clone the repository:
```bash
git clone https://github.com/hakkoda/agent-builder-hub.git
```

2. Set up Python virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # Unix
.\venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

3. Install Node.js dependencies:
```bash
npm install
```

4. Configure AWS credentials:
```bash
aws configure
```

### IDE Configuration
#### VS Code
Required extensions:
- Python
- ESLint
- Prettier
- Docker
- AWS Toolkit
- GitLens

Settings:
```json
{
    "python.formatting.provider": "black",
    "python.linting.enabled": true,
    "python.linting.flake8Enabled": true,
    "typescript.tsdk": "node_modules/typescript/lib",
    "editor.formatOnSave": true
}
```

#### PyCharm
- Enable Python type hints
- Configure black formatter
- Enable flake8 linting
- Set up pytest runner

## Development Workflow

### Branch Naming
Follow these patterns:
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Critical fixes for production
- `release/*` - Release preparation

Examples:
```
feature/agent-creation-wizard
bugfix/knowledge-base-connection
hotfix/security-vulnerability-fix
release/v1.0.0
```

### Commit Messages
Follow Conventional Commits format:
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Example:
```
feat(agent-builder): add template selection wizard

Implements dynamic template loading with preview capability.
Includes unit tests and documentation.

Closes #123
```

### Pull Requests
1. Create PR using template
2. Required sections:
   - Change Description
   - Related Issues
   - Change Type
   - Testing
   - Security Considerations
   - Deployment Impact
3. Obtain 2 approvals
4. Pass all CI checks:
   - code-quality
   - test
   - security-scan
   - build

### Code Review
Reviewers must verify:
- Code quality and standards
- Security considerations
- Test coverage (90% minimum)
- Documentation completeness
- Performance impact

## Code Standards

### Python Standards
- Follow PEP 8
- Use type hints
- Format with black
- Lint with flake8
- Type check with mypy
- 90% test coverage minimum

Example:
```python
from typing import List, Optional

def process_agent_config(config: dict, template_id: str) -> Optional[List[str]]:
    """
    Process agent configuration with template.

    Args:
        config: Agent configuration dictionary
        template_id: Template identifier

    Returns:
        List of validation messages or None
    """
    # Implementation
```

### TypeScript Standards
- Use TypeScript 5.0+
- Strict type checking
- ESLint configuration
- Prettier formatting
- Jest for testing
- 90% test coverage minimum

Example:
```typescript
interface AgentConfig {
  templateId: string;
  parameters: Record<string, unknown>;
}

function validateConfig(config: AgentConfig): string[] {
  // Implementation
}
```

### Documentation
- JSDoc for TypeScript
- Google-style docstrings for Python
- README for each component
- API documentation
- Architecture decision records

### Testing Requirements
- Unit tests required for all code
- Integration tests for workflows
- Performance tests for critical paths
- Security tests for sensitive features
- Coverage requirements:
  - Minimum 90% overall coverage
  - 100% coverage for security-critical code
  - Excluded: tests/*, migrations/*

Quality Gates:
- Code Coverage: 90% minimum
- Security Scan:
  - SAST required
  - Dependency checks
  - No high vulnerabilities
- Performance:
  - Load testing required
  - Response time < 100ms
  - CPU usage < 80%
  - Memory usage < 70%