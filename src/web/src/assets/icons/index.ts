// @aws-amplify/ui-react v6.0.0
import { Icon } from '@aws-amplify/ui-react';

// react-icons/md v4.0.0
import {
  MdDashboard,
  MdAdd,
  MdClose,
  MdChevronLeft,
  MdChevronRight,
  MdSettings,
  MdPerson,
  MdHelp,
  MdWarning,
  MdFileUpload,
  MdStar,
  MdInfo,
} from 'react-icons/md';

// Props interface for AWS Amplify UI compatibility
export interface IconProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  ariaLabel?: string;
  className?: string;
}

// Default icon wrapper with AWS Amplify UI styling
const createStyledIcon = (IconComponent: React.ComponentType<any>) => {
  return ({ size = 'medium', color, ariaLabel, className }: IconProps) => (
    <Icon
      as={IconComponent}
      size={size}
      color={color}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
};

// Navigation and Menu Icons
export const DashboardIcon = createStyledIcon(MdDashboard);
export const AddIcon = createStyledIcon(MdAdd);
export const CloseIcon = createStyledIcon(MdClose);

// Directional Navigation Icons
export const NavigationIcons = {
  left: createStyledIcon(MdChevronLeft),
  right: createStyledIcon(MdChevronRight),
};

// Utility Navigation Icons
export const UtilityIcons = {
  settings: createStyledIcon(MdSettings),
  profile: createStyledIcon(MdPerson),
  help: createStyledIcon(MdHelp),
};

// Status and Notification Icons
export const StatusIcons = {
  warning: createStyledIcon(MdWarning),
  info: createStyledIcon(MdInfo),
};

// Action-Specific Icons
export const ActionIcons = {
  upload: createStyledIcon(MdFileUpload),
  favorite: createStyledIcon(MdStar),
};

// Grouped icon exports for convenience
export const Icons = {
  dashboard: DashboardIcon,
  add: AddIcon,
  close: CloseIcon,
  navigation: NavigationIcons,
  utility: UtilityIcons,
  status: StatusIcons,
  action: ActionIcons,
};

export default Icons;