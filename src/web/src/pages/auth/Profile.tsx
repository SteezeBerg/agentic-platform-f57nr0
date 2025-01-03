import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Heading,
  Text,
  Card,
  Button,
  Loader,
  Alert,
  Form,
  TextField,
  SelectField,
  SwitchField,
  Divider
} from '@aws-amplify/ui-react'; // v6.0.0
import { useTranslation } from 'react-i18next'; // v13.0.0
import { debounce } from 'lodash'; // v4.17.21
import { Analytics } from '@segment/analytics-next'; // v1.51.0

import { Layout } from '../../components/common/Layout';
import { useAuth } from '../../hooks/useAuth';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { UserRole, Permission } from '../../types/auth';
import { LoadingState } from '../../types/common';

// Constants for accessibility and form validation
const ARIA_LABELS = {
  profileSection: 'User profile section',
  personalInfo: 'Personal information form',
  securitySettings: 'Security settings',
  preferences: 'User preferences',
  updateButton: 'Update profile information',
  loadingState: 'Loading profile data',
  errorState: 'Error updating profile'
};

const FORM_VALIDATION = {
  firstName: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z\s-']+$/
  },
  lastName: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z\s-']+$/
  },
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
};

/**
 * Enterprise-grade user profile management component with comprehensive
 * security features and WCAG 2.1 Level AA compliance
 */
const Profile: React.FC = React.memo(() => {
  const { t } = useTranslation();
  const { user, isLoading, error, validateAccess } = useAuth();
  const [formState, setFormState] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    role: user?.role || UserRole.VIEWER,
    preferences: {
      notifications: true,
      darkMode: false,
      highContrast: false,
      reducedMotion: false
    }
  });
  const [updateStatus, setUpdateStatus] = useState<LoadingState>(LoadingState.IDLE);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Track component mount for analytics
  useEffect(() => {
    Analytics.track('Profile_View', {
      userId: user?.id,
      userRole: user?.role
    });
  }, [user]);

  // Validate form data
  const validateForm = useCallback((data: typeof formState) => {
    const errors: Record<string, string> = {};

    if (!FORM_VALIDATION.firstName.pattern.test(data.firstName)) {
      errors.firstName = t('profile.errors.invalidFirstName');
    }
    if (!FORM_VALIDATION.lastName.pattern.test(data.lastName)) {
      errors.lastName = t('profile.errors.invalidLastName');
    }
    if (!FORM_VALIDATION.email.pattern.test(data.email)) {
      errors.email = t('profile.errors.invalidEmail');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [t]);

  // Debounced profile update handler
  const handleProfileUpdate = useMemo(() => 
    debounce(async (updateData: typeof formState) => {
      try {
        setUpdateStatus(LoadingState.LOADING);
        
        if (!validateForm(updateData)) {
          setUpdateStatus(LoadingState.ERROR);
          return;
        }

        // Track update attempt
        Analytics.track('Profile_Update_Attempt', {
          userId: user?.id,
          updateFields: Object.keys(updateData)
        });

        // Implement actual update logic here
        await new Promise(resolve => setTimeout(resolve, 1000));

        setUpdateStatus(LoadingState.SUCCESS);
        Analytics.track('Profile_Update_Success', {
          userId: user?.id
        });
      } catch (error) {
        setUpdateStatus(LoadingState.ERROR);
        Analytics.track('Profile_Update_Error', {
          userId: user?.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 500),
    [user, validateForm]
  );

  // Handle form submission
  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    handleProfileUpdate(formState);
  }, [formState, handleProfileUpdate]);

  if (isLoading) {
    return (
      <Layout>
        <View
          as="div"
          padding="large"
          textAlign="center"
          aria-label={ARIA_LABELS.loadingState}
        >
          <Loader size="large" />
        </View>
      </Layout>
    );
  }

  return (
    <ErrorBoundary>
      <Layout>
        <View
          as="main"
          padding="large"
          role="main"
          aria-labelledby="profile-heading"
        >
          <Heading
            id="profile-heading"
            level={1}
            marginBottom="large"
          >
            {t('profile.title')}
          </Heading>

          {error && (
            <Alert
              variation="error"
              marginBottom="large"
              isDismissible
              hasIcon
            >
              {error.message}
            </Alert>
          )}

          <Card>
            <Form
              onSubmit={handleSubmit}
              aria-label={ARIA_LABELS.personalInfo}
            >
              <TextField
                label={t('profile.fields.firstName')}
                name="firstName"
                value={formState.firstName}
                onChange={e => setFormState(prev => ({
                  ...prev,
                  firstName: e.target.value
                }))}
                required
                hasError={!!formErrors.firstName}
                errorMessage={formErrors.firstName}
                aria-invalid={!!formErrors.firstName}
              />

              <TextField
                label={t('profile.fields.lastName')}
                name="lastName"
                value={formState.lastName}
                onChange={e => setFormState(prev => ({
                  ...prev,
                  lastName: e.target.value
                }))}
                required
                hasError={!!formErrors.lastName}
                errorMessage={formErrors.lastName}
                aria-invalid={!!formErrors.lastName}
              />

              <TextField
                label={t('profile.fields.email')}
                name="email"
                type="email"
                value={formState.email}
                onChange={e => setFormState(prev => ({
                  ...prev,
                  email: e.target.value
                }))}
                required
                hasError={!!formErrors.email}
                errorMessage={formErrors.email}
                aria-invalid={!!formErrors.email}
                disabled={!validateAccess([Permission.EDIT_AGENT])}
              />

              <SelectField
                label={t('profile.fields.role')}
                name="role"
                value={formState.role}
                disabled
              >
                {Object.values(UserRole).map(role => (
                  <option key={role} value={role}>
                    {t(`profile.roles.${role.toLowerCase()}`)}
                  </option>
                ))}
              </SelectField>

              <Divider marginVertical="large" />

              <Heading
                level={2}
                marginBottom="medium"
              >
                {t('profile.preferences.title')}
              </Heading>

              <SwitchField
                label={t('profile.preferences.notifications')}
                name="notifications"
                checked={formState.preferences.notifications}
                onChange={e => setFormState(prev => ({
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    notifications: e.target.checked
                  }
                }))}
              />

              <SwitchField
                label={t('profile.preferences.darkMode')}
                name="darkMode"
                checked={formState.preferences.darkMode}
                onChange={e => setFormState(prev => ({
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    darkMode: e.target.checked
                  }
                }))}
              />

              <SwitchField
                label={t('profile.preferences.highContrast')}
                name="highContrast"
                checked={formState.preferences.highContrast}
                onChange={e => setFormState(prev => ({
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    highContrast: e.target.checked
                  }
                }))}
              />

              <SwitchField
                label={t('profile.preferences.reducedMotion')}
                name="reducedMotion"
                checked={formState.preferences.reducedMotion}
                onChange={e => setFormState(prev => ({
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    reducedMotion: e.target.checked
                  }
                }))}
              />

              <Button
                type="submit"
                variation="primary"
                isFullWidth
                isLoading={updateStatus === LoadingState.LOADING}
                loadingText={t('profile.updating')}
                aria-label={ARIA_LABELS.updateButton}
              >
                {t('profile.actions.update')}
              </Button>
            </Form>
          </Card>
        </View>
      </Layout>
    </ErrorBoundary>
  );
});

Profile.displayName = 'Profile';

export default Profile;