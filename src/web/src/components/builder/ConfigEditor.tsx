import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@aws-amplify/ui-react'; // v6.0.0
import debounce from 'lodash/debounce'; // v4.17.21
import CodeEditor from '../common/CodeEditor';
import { validateAgentConfig } from '../../utils/validation';
import { AgentType } from '../../types/agent';
import { tokens } from '../../config/theme';

interface ConfigEditorProps {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  agentType: AgentType;
  readOnly?: boolean;
  autoFocus?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    message: string;
    line: number;
    column: number;
  }>;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = React.memo(({
  value,
  onChange,
  agentType,
  readOnly = false,
  autoFocus = false
}) => {
  const { colorMode } = useTheme();
  const [validationResult, setValidationResult] = useState<ValidationResult>({ 
    isValid: true, 
    errors: [] 
  });
  const editorRef = useRef<any>(null);

  // Schema-based validation with error markers
  const validateConfig = useCallback((configStr: string): ValidationResult => {
    try {
      const config = JSON.parse(configStr);
      validateAgentConfig(config, agentType);
      return { isValid: true, errors: [] };
    } catch (error: any) {
      const errors = error.details?.errors?.map((err: any) => ({
        message: err.message,
        line: err.path?.[0] ? getLineNumber(configStr, err.path[0]) : 1,
        column: 1
      })) || [{
        message: error.message || 'Invalid configuration',
        line: 1,
        column: 1
      }];
      return { isValid: false, errors };
    }
  }, [agentType]);

  // Convert validation errors to Monaco editor markers
  const getEditorMarkers = useMemo(() => {
    return validationResult.errors.map(error => ({
      message: error.message,
      severity: 8, // Error severity
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.line,
      endColumn: error.column + 1
    }));
  }, [validationResult.errors]);

  // Debounced validation handler
  const debouncedValidate = useMemo(() => 
    debounce((value: string) => {
      const result = validateConfig(value);
      setValidationResult(result);
      onChange(value, result.isValid);

      // Update ARIA live region for screen readers
      const statusElement = document.getElementById('config-editor-status');
      if (statusElement) {
        statusElement.textContent = result.isValid 
          ? 'Configuration is valid' 
          : `Configuration has ${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`;
      }
    }, 300),
    [validateConfig, onChange]
  );

  // Handle configuration changes
  const handleChange = useCallback((newValue: string) => {
    debouncedValidate(newValue);
  }, [debouncedValidate]);

  // Initialize editor with schema and validation
  useEffect(() => {
    if (editorRef.current) {
      // Configure JSON schema validation
      const schema = {
        type: 'object',
        required: ['capabilities', 'knowledgeSourceIds', 'version', 'settings'],
        properties: {
          capabilities: {
            type: 'array',
            items: { type: 'string' }
          },
          knowledgeSourceIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' }
          },
          version: {
            type: 'string',
            pattern: '^\\d+\\.\\d+\\.\\d+$'
          },
          settings: {
            type: 'object',
            properties: {
              model_settings: {
                type: 'object',
                properties: {
                  temperature: { type: 'number', minimum: 0, maximum: 1 },
                  max_tokens: { type: 'number', minimum: 1 },
                  top_p: { type: 'number', minimum: 0, maximum: 1 }
                }
              }
            }
          }
        }
      };

      editorRef.current.updateOptions({
        formatOnPaste: true,
        formatOnType: true,
        autoIndent: true,
        tabSize: 2,
        quickSuggestions: true
      });
    }
  }, []);

  // Keyboard shortcuts setup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to trigger validation
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        debouncedValidate(value);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [value, debouncedValidate]);

  return (
    <div 
      role="region" 
      aria-label="Configuration Editor"
      className="config-editor-container"
      style={{
        border: `1px solid ${tokens.colors.border.primary}`,
        borderRadius: tokens.radii.sm,
        padding: tokens.space.xs
      }}
    >
      <CodeEditor
        value={value}
        onChange={handleChange}
        language="json"
        readOnly={readOnly}
        markers={getEditorMarkers}
        height="400px"
        theme={colorMode === 'dark' ? 'vs-dark' : 'vs-light'}
      />
      
      {/* Validation Status */}
      <div
        id="config-editor-status"
        role="status"
        aria-live="polite"
        className="sr-only"
      />
      
      {/* Error Summary */}
      {!validationResult.isValid && (
        <div
          role="alert"
          aria-atomic="true"
          style={{
            marginTop: tokens.space.xs,
            padding: tokens.space.xs,
            backgroundColor: tokens.colors.error.light,
            color: tokens.colors.error.contrast,
            borderRadius: tokens.radii.xs,
            fontSize: tokens.typography.fontSize.sm
          }}
        >
          {validationResult.errors.map((error, index) => (
            <div key={index}>
              Line {error.line}: {error.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// Helper function to get line number from JSON path
const getLineNumber = (jsonString: string, path: string): number => {
  const lines = jsonString.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`"${path}"`)) {
      return i + 1;
    }
  }
  return 1;
};

ConfigEditor.displayName = 'ConfigEditor';

export default ConfigEditor;