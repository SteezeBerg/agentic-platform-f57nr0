import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import checker from 'vite-plugin-checker';
import compression from 'vite-plugin-compression';

// https://vitejs.dev/config/
export default defineConfig({
  // Development server configuration
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    target: ['chrome90', 'firefox88', 'safari14', 'edge90'],
    rollupOptions: {
      output: {
        manualChunks: {
          // Core vendor chunks
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // AWS integration chunks
          aws: ['@aws-amplify/ui-react', 'aws-amplify'],
          // State management chunks
          state: ['@reduxjs/toolkit', 'react-redux'],
          // Code editor chunks
          editor: ['monaco-editor'],
          // UI framework chunks
          ui: ['@mui/material', '@emotion/react', '@emotion/styled']
        }
      }
    },
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: true
  },

  // Path resolution and aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@services': path.resolve(__dirname, './src/services'),
      '@store': path.resolve(__dirname, './src/store'),
      '@types': path.resolve(__dirname, './src/types'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@config': path.resolve(__dirname, './src/config'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@features': path.resolve(__dirname, './src/features'),
      '@api': path.resolve(__dirname, './src/api')
    }
  },

  // Plugins configuration
  plugins: [
    react({
      // React plugin configuration for optimal development experience
      fastRefresh: true,
      babel: {
        plugins: [
          ['@emotion/babel-plugin'],
          ['@babel/plugin-transform-runtime']
        ]
      }
    }),
    checker({
      // Type checking during development
      typescript: true,
      eslint: {
        lintCommand: 'eslint "./src/**/*.{ts,tsx}"'
      }
    }),
    compression({
      // Compression for production builds
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 10240
    })
  ],

  // Environment variables definition
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL),
    'process.env.VITE_AWS_REGION': JSON.stringify(process.env.VITE_AWS_REGION),
    'process.env.VITE_COGNITO_USER_POOL_ID': JSON.stringify(process.env.VITE_COGNITO_USER_POOL_ID),
    'process.env.VITE_COGNITO_CLIENT_ID': JSON.stringify(process.env.VITE_COGNITO_CLIENT_ID)
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@aws-amplify/ui-react',
      '@reduxjs/toolkit'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },

  // Preview server configuration
  preview: {
    port: 3000,
    strictPort: true
  },

  // CSS configuration
  css: {
    devSourcemap: true,
    modules: {
      localsConvention: 'camelCase'
    }
  }
});