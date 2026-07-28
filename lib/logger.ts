/**
 * Logger Utility
 * Provides conditional logging based on environment
 * Only logs in development, silent in production
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  /**
   * Debug logs - only shown in development
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Info logs - only shown in development
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  /**
   * Warning logs - shown in all environments
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Error logs - shown in all environments
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
