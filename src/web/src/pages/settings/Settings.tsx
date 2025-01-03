import React, { useCallback, useEffect, useState } from 'react';
import { View, Card, SwitchField, SelectField, Button, Spinner } from '@aws-amplify/ui-react';
import { BroadcastChannel } from 'broadcast-channel';
import { SecureStorage } from '@aws-amplify/storage';
import { Layout } from '../../components/common/Layout';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

// Interface for user preferences with versioning
interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    enabled: boolean;
    email: boolean;
    push: boolean;
    desktop: boolean;
  };
  language: string;
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    largeText: boolean;
  };
  version: string;
  lastSync: string;
}

// Constants for settings management
const PREFERENCES_VERSION = '1.0.0';
const STORAGE_KEY = 'user_preferences';
const SUPPORTED_LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' }
];

/**
 * Settings page component that provides secure user preferences and configuration
 * management with cross-tab synchronization and accessibility features.
 */
const Settings: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { theme, isDarkMode, toggleTheme, detectSystemPreference } = useTheme();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize secure storage and broadcast channel
  const storage = new SecureStorage();
  const broadcastChannel = new BroadcastChannel('settings_sync');

  // Load user preferences
  const loadPreferences = useCallback(async () => {
    try {
      setIsLoading(true);
      const stored = await storage.get(STORAGE_KEY);
      
      if (stored) {
        setPreferences(JSON.parse(stored));
      } else {
        // Set default preferences
        const defaults: UserPreferences = {
          theme: 'system',
          notifications: {
            enabled: true,
            email: true,
            push: true,
            desktop: true
          },
          language: 'en',
          accessibility: {
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            highContrast: window.matchMedia('(prefers-contrast: more)').matches,
            largeText: false
          },
          version: PREFERENCES_VERSION,
          lastSync: new Date().toISOString()
        };
        setPreferences(defaults);
      }
    } catch (err) {
      setError('Failed to load preferences');
      console.error('Error loading preferences:', err);
    } finally {
      setIsLoading(false);
    }
  }, [storage]);

  // Save preferences with validation
  const savePreferences = useCallback(async (newPreferences: UserPreferences) => {
    try {
      setIsSaving(true);
      setError(null);

      // Validate preferences before saving
      if (!newPreferences.version || !newPreferences.language) {
        throw new Error('Invalid preferences format');
      }

      // Update last sync timestamp
      newPreferences.lastSync = new Date().toISOString();

      // Encrypt and save preferences
      await storage.set(STORAGE_KEY, JSON.stringify(newPreferences));

      // Broadcast changes to other tabs
      broadcastChannel.postMessage({
        type: 'PREFERENCES_UPDATED',
        preferences: newPreferences
      });

      setPreferences(newPreferences);
    } catch (err) {
      setError('Failed to save preferences');
      console.error('Error saving preferences:', err);
    } finally {
      setIsSaving(false);
    }
  }, [storage, broadcastChannel]);

  // Handle preference changes
  const handlePreferenceChange = useCallback((key: string, value: any) => {
    if (!preferences) return;

    const newPreferences = {
      ...preferences,
      [key]: value
    };
    savePreferences(newPreferences);
  }, [preferences, savePreferences]);

  // Initialize preferences and sync
  useEffect(() => {
    if (isAuthenticated) {
      loadPreferences();
    }

    // Listen for preference updates from other tabs
    broadcastChannel.onmessage = (message) => {
      if (message.type === 'PREFERENCES_UPDATED') {
        setPreferences(message.preferences);
      }
    };

    return () => {
      broadcastChannel.close();
    };
  }, [isAuthenticated, loadPreferences, broadcastChannel]);

  if (isLoading) {
    return <Spinner size="large" />;
  }

  return (
    <Layout>
      <PageHeader
        title="Settings"
        subtitle="Manage your preferences and account settings"
        testId="settings-page-header"
      />

      <View as="main" padding="medium">
        <Card>
          <View as="section" marginBottom="large">
            <h2>Theme Preferences</h2>
            <SwitchField
              label="Dark Mode"
              checked={isDarkMode}
              onChange={(e) => {
                toggleTheme();
                handlePreferenceChange('theme', e.target.checked ? 'dark' : 'light');
              }}
              labelPosition="end"
              name="darkMode"
            />
            <Button
              onClick={() => {
                detectSystemPreference();
                handlePreferenceChange('theme', 'system');
              }}
              variation="link"
            >
              Use System Theme
            </Button>
          </View>

          <View as="section" marginBottom="large">
            <h2>Notification Settings</h2>
            {preferences && (
              <>
                <SwitchField
                  label="Enable Notifications"
                  checked={preferences.notifications.enabled}
                  onChange={(e) => handlePreferenceChange('notifications', {
                    ...preferences.notifications,
                    enabled: e.target.checked
                  })}
                  labelPosition="end"
                  name="notificationsEnabled"
                />
                <SwitchField
                  label="Email Notifications"
                  checked={preferences.notifications.email}
                  onChange={(e) => handlePreferenceChange('notifications', {
                    ...preferences.notifications,
                    email: e.target.checked
                  })}
                  labelPosition="end"
                  name="emailNotifications"
                  isDisabled={!preferences.notifications.enabled}
                />
                <SwitchField
                  label="Push Notifications"
                  checked={preferences.notifications.push}
                  onChange={(e) => handlePreferenceChange('notifications', {
                    ...preferences.notifications,
                    push: e.target.checked
                  })}
                  labelPosition="end"
                  name="pushNotifications"
                  isDisabled={!preferences.notifications.enabled}
                />
              </>
            )}
          </View>

          <View as="section" marginBottom="large">
            <h2>Language Settings</h2>
            <SelectField
              label="Interface Language"
              value={preferences?.language}
              onChange={(e) => handlePreferenceChange('language', e.target.value)}
              options={SUPPORTED_LANGUAGES}
            />
          </View>

          <View as="section">
            <h2>Accessibility</h2>
            {preferences && (
              <>
                <SwitchField
                  label="Reduce Motion"
                  checked={preferences.accessibility.reducedMotion}
                  onChange={(e) => handlePreferenceChange('accessibility', {
                    ...preferences.accessibility,
                    reducedMotion: e.target.checked
                  })}
                  labelPosition="end"
                  name="reducedMotion"
                />
                <SwitchField
                  label="High Contrast"
                  checked={preferences.accessibility.highContrast}
                  onChange={(e) => handlePreferenceChange('accessibility', {
                    ...preferences.accessibility,
                    highContrast: e.target.checked
                  })}
                  labelPosition="end"
                  name="highContrast"
                />
                <SwitchField
                  label="Large Text"
                  checked={preferences.accessibility.largeText}
                  onChange={(e) => handlePreferenceChange('accessibility', {
                    ...preferences.accessibility,
                    largeText: e.target.checked
                  })}
                  labelPosition="end"
                  name="largeText"
                />
              </>
            )}
          </View>
        </Card>

        {error && (
          <View
            backgroundColor="error.light"
            padding="medium"
            marginTop="medium"
            borderRadius="medium"
          >
            {error}
          </View>
        )}
      </View>
    </Layout>
  );
};

export default Settings;