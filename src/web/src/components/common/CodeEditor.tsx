import React, { useCallback, useEffect, useRef } from 'react';
import { Editor, OnMount } from '@monaco-editor/react';
import { useTheme } from '@aws-amplify/ui-react';
import debounce from 'lodash/debounce';
import { tokens } from '../../config/theme';

// Editor theme types aligned with AWS Amplify design system
type EditorTheme = 'light' | 'dark' | 'high-contrast';

interface CodeEditorProps {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  language: string;
  readOnly?: boolean;
  height?: string;
  theme?: EditorTheme;
}

// Monaco editor configuration options
const defaultOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    useShadows: false,
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  lineNumbers: 'on',
  glyphMargin: true,
  folding: true,
  fontSize: parseInt(tokens.typography.fontSize.md),
  fontFamily: tokens.typography.fontFamily,
  tabSize: 2,
  renderLineHighlight: 'all',
  suggestOnTriggerCharacters: true,
  quickSuggestions: true,
  wordBasedSuggestions: true,
  accessibilitySupport: 'on',
  'semanticHighlighting.enabled': true,
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  readOnly = false,
  height = '400px',
  theme: propTheme,
}) => {
  const { colorMode } = useTheme();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Determine editor theme based on system theme and props
  const resolveTheme = useCallback((): string => {
    if (propTheme) {
      return propTheme === 'high-contrast' ? 'hc-black' : `vs-${propTheme}`;
    }
    return colorMode === 'dark' ? 'vs-dark' : 'vs';
  }, [colorMode, propTheme]);

  // Configure Monaco editor instance
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure editor accessibility features
    editor.updateOptions({
      ...defaultOptions,
      readOnly,
      accessibilitySupport: 'on',
      ariaLabel: `Code editor for ${language}`,
      tabIndex: 0,
    });

    // Register custom keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Trigger save action
      const content = editor.getValue();
      onChange(content, true);
    });

    // Configure language-specific features
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        return {
          suggestions: [
            {
              label: 'example',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: 'example',
              range,
            },
          ],
        };
      },
    });
  };

  // Debounced change handler with validation
  const handleEditorChange = useCallback(
    debounce((value: string) => {
      if (!editorRef.current) return;

      const model = editorRef.current.getModel();
      const markers = monacoRef.current?.editor.getModelMarkers({
        resource: model.uri,
      });

      const isValid = !markers || markers.length === 0;
      onChange(value, isValid);

      // Update ARIA live region for screen readers
      const ariaLive = document.getElementById('editor-status');
      if (ariaLive) {
        ariaLive.textContent = isValid
          ? 'Code validation successful'
          : `Code contains ${markers.length} errors`;
      }
    }, 300),
    [onChange]
  );

  // Update editor theme when system theme changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        theme: resolveTheme(),
      });
    }
  }, [colorMode, propTheme, resolveTheme]);

  return (
    <React.Fragment>
      <div
        style={{
          border: `1px solid ${tokens.colors.border.primary}`,
          borderRadius: tokens.radii.sm,
          overflow: 'hidden',
        }}
      >
        <Editor
          height={height}
          defaultLanguage={language}
          value={value}
          options={defaultOptions}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          theme={resolveTheme()}
          loading={
            <div role="status" aria-label="Loading editor">
              Loading editor...
            </div>
          }
        />
      </div>
      {/* ARIA live region for status announcements */}
      <div
        id="editor-status"
        role="status"
        aria-live="polite"
        className="sr-only"
      />
      {/* Error boundary fallback */}
      <div
        role="alert"
        aria-atomic="true"
        style={{ display: 'none' }}
        id="editor-error"
      >
        An error occurred while loading the code editor. Please try refreshing the
        page.
      </div>
    </React.Fragment>
  );
};

export default CodeEditor;