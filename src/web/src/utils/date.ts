/**
 * Enterprise-grade date utility functions for the Agent Builder Hub
 * Provides standardized date handling with timezone support and validation
 * @version 1.0.0
 */

import { format, parseISO, addDays, differenceInDays, isValid } from 'date-fns'; // ^2.30.0
import { formatInTimeZone } from 'date-fns-tz'; // ^2.0.0
import { ISO8601DateTime } from '../types/common';

// Constants for date formatting and validation
export const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';
export const DEFAULT_DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';
export const DEFAULT_TIME_FORMAT = 'HH:mm:ss';
export const DATE_LOCALE = navigator.language || 'en-US';
export const MAX_DATE = new Date(8640000000000000); // Maximum valid JavaScript date
export const MIN_DATE = new Date(-8640000000000000); // Minimum valid JavaScript date

/**
 * Error class for date-related operations
 */
class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateError';
  }
}

/**
 * Validates if a date is within acceptable range
 * @param date - Date to validate
 * @returns boolean indicating if date is valid
 */
const isValidDate = (date: Date): boolean => {
  return (
    isValid(date) &&
    date >= MIN_DATE &&
    date <= MAX_DATE
  );
};

/**
 * Validates ISO8601 string format
 * @param dateStr - String to validate
 * @returns boolean indicating if string is valid ISO8601
 */
const isValidISOString = (dateStr: string): boolean => {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  return iso8601Regex.test(dateStr);
};

/**
 * Formats a date with comprehensive validation and timezone support
 * @param date - Date object or ISO string to format
 * @param formatStr - Optional format string (defaults to DEFAULT_DATETIME_FORMAT)
 * @param timezone - Optional timezone (defaults to local timezone)
 * @returns Formatted date string
 * @throws DateError if date is invalid
 */
export const formatDate = (
  date: Date | string,
  formatStr: string = DEFAULT_DATETIME_FORMAT,
  timezone?: string
): string => {
  try {
    // Convert string dates to Date objects
    const dateObj = typeof date === 'string' ? parseISO(date) : date;

    // Validate date
    if (!isValidDate(dateObj)) {
      throw new DateError('Invalid date provided');
    }

    // Format with timezone if provided, otherwise use local
    if (timezone) {
      return formatInTimeZone(dateObj, timezone, formatStr);
    }

    return format(dateObj, formatStr, {
      locale: DATE_LOCALE
    });
  } catch (error) {
    throw new DateError(
      `Error formatting date: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Parses an ISO 8601 datetime string into a Date object
 * @param dateStr - ISO 8601 datetime string
 * @returns Parsed Date object
 * @throws DateError if string is invalid or parsing fails
 */
export const parseISOString = (dateStr: ISO8601DateTime): Date => {
  try {
    // Validate ISO string format
    if (!isValidISOString(dateStr)) {
      throw new DateError('Invalid ISO 8601 datetime string format');
    }

    // Parse the string
    const parsedDate = parseISO(dateStr);

    // Validate parsed date
    if (!isValidDate(parsedDate)) {
      throw new DateError('Parsed date is invalid or out of range');
    }

    return parsedDate;
  } catch (error) {
    throw new DateError(
      `Error parsing ISO string: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Adds days to a date with validation
 * @param date - Base date
 * @param days - Number of days to add
 * @returns New Date object
 * @throws DateError if resulting date is invalid
 */
export const addDaysToDate = (date: Date, days: number): Date => {
  try {
    if (!isValidDate(date)) {
      throw new DateError('Invalid base date');
    }

    const newDate = addDays(date, days);

    if (!isValidDate(newDate)) {
      throw new DateError('Resulting date is invalid or out of range');
    }

    return newDate;
  } catch (error) {
    throw new DateError(
      `Error adding days to date: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Calculates difference between two dates in days
 * @param dateLeft - First date
 * @param dateRight - Second date
 * @returns Number of days difference
 * @throws DateError if either date is invalid
 */
export const getDateDifference = (dateLeft: Date, dateRight: Date): number => {
  try {
    if (!isValidDate(dateLeft) || !isValidDate(dateRight)) {
      throw new DateError('Invalid date(s) provided');
    }

    return differenceInDays(dateLeft, dateRight);
  } catch (error) {
    throw new DateError(
      `Error calculating date difference: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Checks if a date string is a valid ISO 8601 datetime
 * @param dateStr - String to validate
 * @returns boolean indicating validity
 */
export const isValidISO8601 = (dateStr: string): boolean => {
  try {
    if (!isValidISOString(dateStr)) {
      return false;
    }
    const parsedDate = parseISO(dateStr);
    return isValidDate(parsedDate);
  } catch {
    return false;
  }
};