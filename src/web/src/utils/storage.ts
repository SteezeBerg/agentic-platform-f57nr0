import CryptoJS from 'crypto-js';
import { LOCAL_STORAGE_KEYS } from '../config/constants';
import { ApiResponse } from '../types/common';

/**
 * Configuration options for StorageService initialization
 * @version 1.0.0
 */
export interface StorageOptions {
  useSession?: boolean;
  encryptionKey?: string;
  quotaWarningThreshold?: number;
}

/**
 * Service class providing secure, type-safe storage operations with encryption support
 * Implements browser storage operations with comprehensive error handling and quota management
 * @version 1.0.0
 */
export class StorageService {
  private readonly storage: Storage;
  private readonly encryptionKey?: string;
  private readonly quotaWarningThreshold: number;
  private isStorageAvailable: boolean;
  private static readonly STORAGE_QUOTA = 5 * 1024 * 1024; // 5MB default quota
  private static readonly ENCRYPTION_PREFIX = 'ENC:';

  /**
   * Initialize storage service with optional encryption and storage type selection
   * @param options - Configuration options for storage service
   */
  constructor(options: StorageOptions = {}) {
    const {
      useSession = false,
      encryptionKey,
      quotaWarningThreshold = 0.9
    } = options;

    this.storage = useSession ? sessionStorage : localStorage;
    this.encryptionKey = encryptionKey;
    this.quotaWarningThreshold = quotaWarningThreshold;
    this.isStorageAvailable = this.checkStorageAvailability();

    // Initialize storage monitoring
    this.setupStorageMonitoring();
  }

  /**
   * Store data in browser storage with optional encryption
   * @param key - Storage key
   * @param value - Data to store
   * @param encrypt - Whether to encrypt the data
   * @returns ApiResponse indicating success or failure
   */
  public setItem<T>(key: string, value: T, encrypt = false): ApiResponse<void> {
    try {
      if (!this.isStorageAvailable) {
        throw new Error('Storage is not available');
      }

      if (!key) {
        throw new Error('Storage key is required');
      }

      // Check quota before storing
      if (this.isQuotaExceeded()) {
        throw new Error('Storage quota exceeded');
      }

      let serializedValue = JSON.stringify(value);

      if (encrypt && this.encryptionKey) {
        serializedValue = StorageService.ENCRYPTION_PREFIX + 
          CryptoJS.AES.encrypt(serializedValue, this.encryptionKey).toString();
      }

      this.storage.setItem(key, serializedValue);

      return {
        success: true,
        data: void 0,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: void 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Retrieve and parse data from storage with automatic decryption if needed
   * @param key - Storage key
   * @returns ApiResponse with retrieved data or error
   */
  public getItem<T>(key: string): ApiResponse<T | null> {
    try {
      if (!this.isStorageAvailable) {
        throw new Error('Storage is not available');
      }

      const value = this.storage.getItem(key);

      if (value === null) {
        return {
          success: true,
          data: null,
          error: null
        };
      }

      let parsedValue: string = value;

      // Handle encrypted data
      if (value.startsWith(StorageService.ENCRYPTION_PREFIX) && this.encryptionKey) {
        const encryptedData = value.slice(StorageService.ENCRYPTION_PREFIX.length);
        const decrypted = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
        parsedValue = decrypted.toString(CryptoJS.enc.Utf8);
      }

      return {
        success: true,
        data: JSON.parse(parsedValue) as T,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Remove item from storage
   * @param key - Storage key
   * @returns ApiResponse indicating success or failure
   */
  public removeItem(key: string): ApiResponse<void> {
    try {
      if (!this.isStorageAvailable) {
        throw new Error('Storage is not available');
      }

      this.storage.removeItem(key);

      return {
        success: true,
        data: void 0,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: void 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Clear all items from storage
   * @returns ApiResponse indicating success or failure
   */
  public clear(): ApiResponse<void> {
    try {
      if (!this.isStorageAvailable) {
        throw new Error('Storage is not available');
      }

      this.storage.clear();

      return {
        success: true,
        data: void 0,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: void 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Check if storage is available and functioning
   * @private
   * @returns boolean indicating storage availability
   */
  private checkStorageAvailability(): boolean {
    try {
      const testKey = '__storage_test__';
      this.storage.setItem(testKey, testKey);
      this.storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if storage quota is exceeded
   * @private
   * @returns boolean indicating if quota is exceeded
   */
  private isQuotaExceeded(): boolean {
    try {
      const totalSize = Object.entries(this.storage)
        .reduce((total, [_, value]) => total + (value?.length || 0), 0);
      
      return totalSize >= StorageService.STORAGE_QUOTA * this.quotaWarningThreshold;
    } catch (e) {
      return true;
    }
  }

  /**
   * Set up storage event monitoring for cross-tab synchronization
   * @private
   */
  private setupStorageMonitoring(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (!e.key || !e.newValue) return;
        
        // Handle storage changes from other tabs
        if (Object.values(LOCAL_STORAGE_KEYS).includes(e.key)) {
          // Trigger any necessary updates or callbacks
          this.handleStorageChange(e.key, e.newValue);
        }
      });
    }
  }

  /**
   * Handle storage changes from other tabs
   * @private
   * @param key - Changed storage key
   * @param newValue - New storage value
   */
  private handleStorageChange(key: string, newValue: string): void {
    // Implement specific handling for different storage keys
    switch (key) {
      case LOCAL_STORAGE_KEYS.THEME:
      case LOCAL_STORAGE_KEYS.LANGUAGE:
      case LOCAL_STORAGE_KEYS.USER_PREFERENCES:
        // Handle specific storage key changes
        break;
      default:
        // Handle other storage changes
        break;
    }
  }
}