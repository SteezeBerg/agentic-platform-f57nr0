/**
 * Utility functions for data formatting, string manipulation, and display formatting
 * Provides consistent formatting capabilities across the Agent Builder Hub frontend
 * @version 1.0.0
 */

import numeral from 'numeral'; // v2.0.6
import { memoize } from 'lodash'; // v4.17.21
import { ISO8601DateTime } from '../types/common';
import { AgentStatus } from '../types/agent';

// Constants for formatting patterns
export const DEFAULT_NUMBER_FORMAT = '0,0.00';
export const DEFAULT_PERCENTAGE_FORMAT = '0.00%';
export const DEFAULT_CURRENCY_FORMAT = '$0,0.00';
export const DEFAULT_FILE_SIZE_FORMAT = '0.00b';
export const TRUNCATE_LENGTH = 50;

// Status color mapping for consistent UI
export const STATUS_COLORS = {
  [AgentStatus.CREATED]: 'blue.500',
  [AgentStatus.CONFIGURING]: 'purple.500',
  [AgentStatus.READY]: 'green.500',
  [AgentStatus.DEPLOYING]: 'orange.500',
  [AgentStatus.DEPLOYED]: 'green.500',
  [AgentStatus.ERROR]: 'red.500',
  [AgentStatus.ARCHIVED]: 'gray.500'
} as const;

// Types for formatting options
interface FormatNumberOptions {
  locale?: string;
  fallback?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

interface FormatMetricOptions extends FormatNumberOptions {
  unit?: string;
  showUnit?: boolean;
}

interface FormatStatusOptions {
  uppercase?: boolean;
  showIcon?: boolean;
  ariaLabel?: string;
}

/**
 * Formats a number using specified format pattern with error handling and localization
 * @param value - Number to format
 * @param format - Numeral.js format pattern
 * @param options - Formatting options
 * @returns Formatted number string
 */
export const formatNumber = memoize((
  value: number,
  format: string = DEFAULT_NUMBER_FORMAT,
  options: FormatNumberOptions = {}
): string => {
  try {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return options.fallback || '0';
    }

    const instance = numeral(value);
    let formatted = instance.format(format);

    if (options.locale) {
      const numberFormat = new Intl.NumberFormat(options.locale, {
        minimumFractionDigits: options.minimumFractionDigits,
        maximumFractionDigits: options.maximumFractionDigits
      });
      formatted = numberFormat.format(value);
    }

    return formatted || options.fallback || '0';
  } catch (error) {
    console.error('Error formatting number:', error);
    return options.fallback || '0';
  }
});

/**
 * Formats a metric value with appropriate unit and validation
 * @param value - Metric value to format
 * @param unit - Metric unit
 * @param options - Formatting options
 * @returns Formatted metric string with unit
 */
export const formatMetricValue = memoize((
  value: number,
  unit: string,
  options: FormatMetricOptions = {}
): string => {
  try {
    let format = DEFAULT_NUMBER_FORMAT;
    let formattedValue = '';

    switch (unit.toLowerCase()) {
      case 'percentage':
        format = DEFAULT_PERCENTAGE_FORMAT;
        break;
      case 'bytes':
        format = DEFAULT_FILE_SIZE_FORMAT;
        break;
      case 'currency':
        format = DEFAULT_CURRENCY_FORMAT;
        break;
      default:
        format = DEFAULT_NUMBER_FORMAT;
    }

    formattedValue = formatNumber(value, format, options);

    if (options.showUnit && unit && unit.toLowerCase() !== 'percentage') {
      formattedValue = `${formattedValue}${unit === 'bytes' ? '' : ` ${unit}`}`;
    }

    return formattedValue;
  } catch (error) {
    console.error('Error formatting metric value:', error);
    return options.fallback || '0';
  }
});

/**
 * Formats agent status with color coding and accessibility support
 * @param status - Agent status enum value
 * @param options - Formatting options
 * @returns Formatted status object with text and color
 */
export const formatAgentStatus = memoize((
  status: AgentStatus,
  options: FormatStatusOptions = {}
): { text: string; color: string; ariaLabel: string } => {
  try {
    const statusText = status.toLowerCase()
      .split('_')
      .map(word => options.uppercase 
        ? word.toUpperCase() 
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(' ');

    const color = STATUS_COLORS[status] || 'gray.500';
    
    const ariaLabel = options.ariaLabel || `Agent status: ${statusText}`;

    return {
      text: statusText,
      color,
      ariaLabel
    };
  } catch (error) {
    console.error('Error formatting agent status:', error);
    return {
      text: 'Unknown',
      color: 'gray.500',
      ariaLabel: 'Agent status: Unknown'
    };
  }
});

/**
 * Formats a datetime string to localized format
 * @param datetime - ISO8601 datetime string
 * @param locale - Locale string for formatting
 * @returns Formatted datetime string
 */
export const formatDateTime = memoize((
  datetime: ISO8601DateTime,
  locale: string = 'en-US'
): string => {
  try {
    const date = new Date(datetime);
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return datetime;
  }
});

/**
 * Truncates text with ellipsis and accessibility support
 * @param text - Text to truncate
 * @param length - Maximum length before truncation
 * @returns Truncated text with ellipsis
 */
export const truncateText = memoize((
  text: string,
  length: number = TRUNCATE_LENGTH
): string => {
  try {
    if (text.length <= length) {
      return text;
    }
    return `${text.slice(0, length)}...`;
  } catch (error) {
    console.error('Error truncating text:', error);
    return text;
  }
});