import React, { useCallback, useRef, useState, useEffect } from 'react';
import { View, Text, Icon, useTheme } from '@aws-amplify/ui-react'; // v6.0.0
import { motion, AnimatePresence } from 'framer-motion'; // v10.16.4
import { useInternationalization } from '@aws-amplify/ui-react-i18n'; // v6.0.0
import { useEncryption } from '@aws-amplify/encryption'; // v6.0.0
import { Button } from './Button';
import { showNotification } from './Toast';
import { LoadingState } from '../../types/common';

export interface FileUploadProps {
  accept: string;
  multiple?: boolean;
  maxSize?: number;
  maxConcurrentUploads?: number;
  chunkSize?: number;
  encryptionEnabled?: boolean;
  onUpload: (files: File[]) => Promise<void>;
  onProgress?: (progress: number) => void;
  onError?: (error: string) => void;
  validateContent?: (file: File) => Promise<boolean>;
}

const FileUpload: React.FC<FileUploadProps> = ({
  accept,
  multiple = false,
  maxSize = 10 * 1024 * 1024, // 10MB default
  maxConcurrentUploads = 3,
  chunkSize = 1024 * 1024, // 1MB chunks
  encryptionEnabled = false,
  onUpload,
  onProgress,
  onError,
  validateContent
}) => {
  const { tokens } = useTheme();
  const { t } = useInternationalization();
  const { encryptFile } = useEncryption();
  
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  
  // Track active uploads
  const activeUploads = useRef<Map<string, boolean>>(new Map());
  const uploadQueue = useRef<File[]>([]);

  // Cleanup function for component unmount
  useEffect(() => {
    return () => {
      activeUploads.current.clear();
      uploadQueue.current = [];
    };
  }, []);

  const validateFile = useCallback(async (file: File): Promise<boolean> => {
    // Size validation
    if (file.size > maxSize) {
      onError?.(t('fileUpload.error.fileTooBig', { maxSize: maxSize / (1024 * 1024) }));
      return false;
    }

    // Type validation
    const acceptedTypes = accept.split(',').map(type => type.trim());
    if (!acceptedTypes.some(type => file.type.match(type))) {
      onError?.(t('fileUpload.error.invalidType'));
      return false;
    }

    // Custom content validation if provided
    if (validateContent) {
      try {
        const isValid = await validateContent(file);
        if (!isValid) {
          onError?.(t('fileUpload.error.invalidContent'));
          return false;
        }
      } catch (error) {
        onError?.(t('fileUpload.error.validationFailed'));
        return false;
      }
    }

    return true;
  }, [accept, maxSize, validateContent, onError, t]);

  const processFileUpload = useCallback(async (file: File) => {
    try {
      // Encrypt file if enabled
      let processedFile = file;
      if (encryptionEnabled) {
        processedFile = await encryptFile(file);
      }

      // Split file into chunks
      const chunks: Blob[] = [];
      let offset = 0;
      while (offset < processedFile.size) {
        chunks.push(processedFile.slice(offset, offset + chunkSize));
        offset += chunkSize;
      }

      // Upload chunks with progress tracking
      let uploadedChunks = 0;
      const totalChunks = chunks.length;

      await Promise.all(
        chunks.map(async (chunk, index) => {
          const chunkFile = new File([chunk], `${file.name}-chunk-${index}`);
          await onUpload([chunkFile]);
          uploadedChunks++;
          
          const progress = (uploadedChunks / totalChunks) * 100;
          setUploadProgress(progress);
          onProgress?.(progress);
        })
      );

      return true;
    } catch (error) {
      onError?.(t('fileUpload.error.uploadFailed'));
      return false;
    }
  }, [encryptionEnabled, chunkSize, onUpload, onProgress, onError, t, encryptFile]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];

    // Validate all files first
    for (const file of fileArray) {
      const isValid = await validateFile(file);
      if (isValid) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      return;
    }

    setIsUploading(true);
    uploadQueue.current = [...uploadQueue.current, ...validFiles];

    // Process upload queue with concurrency limit
    while (uploadQueue.current.length > 0) {
      if (activeUploads.current.size >= maxConcurrentUploads) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      const file = uploadQueue.current.shift();
      if (!file) continue;

      const uploadId = `${file.name}-${Date.now()}`;
      activeUploads.current.set(uploadId, true);

      processFileUpload(file)
        .then(() => {
          activeUploads.current.delete(uploadId);
          showNotification({
            type: 'success',
            message: t('fileUpload.success.fileUploaded', { fileName: file.name })
          });
        })
        .catch(() => {
          activeUploads.current.delete(uploadId);
          onError?.(t('fileUpload.error.uploadFailed'));
        });
    }

    setIsUploading(false);
    setUploadProgress(0);
  }, [validateFile, processFileUpload, maxConcurrentUploads, onError, t]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const { files } = event.dataTransfer;
    if (!files || (files.length > 1 && !multiple)) {
      onError?.(t('fileUpload.error.tooManyFiles'));
      return;
    }

    handleFiles(files);
  }, [handleFiles, multiple, onError, t]);

  return (
    <View>
      <motion.div
        initial={false}
        animate={isDragging ? 'drag' : 'rest'}
        variants={{
          drag: { scale: 1.02, borderColor: tokens.colors.brand.primary },
          rest: { scale: 1, borderColor: tokens.colors.border.primary }
        }}
      >
        <View
          ref={dropZoneRef}
          backgroundColor={tokens.colors.background.secondary}
          borderRadius={tokens.radii.medium}
          borderWidth="2px"
          borderStyle="dashed"
          borderColor={tokens.colors.border.primary}
          padding={tokens.space.large}
          textAlign="center"
          cursor="pointer"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          data-testid="file-upload-dropzone"
          aria-label={t('fileUpload.dropzone.label')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            style={{ display: 'none' }}
            aria-hidden="true"
          />

          <Icon
            ariaLabel={t('fileUpload.icon.label')}
            name="upload"
            size={tokens.fontSizes.xxl}
            color={tokens.colors.font.secondary}
          />

          <Text
            fontSize={tokens.fontSizes.large}
            color={tokens.colors.font.primary}
            marginTop={tokens.space.medium}
          >
            {t('fileUpload.dropzone.text')}
          </Text>

          <Text
            fontSize={tokens.fontSizes.small}
            color={tokens.colors.font.secondary}
            marginTop={tokens.space.small}
          >
            {t('fileUpload.dropzone.hint', {
              types: accept,
              maxSize: maxSize / (1024 * 1024)
            })}
          </Text>
        </View>
      </motion.div>

      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <View
              marginTop={tokens.space.medium}
              padding={tokens.space.medium}
              backgroundColor={tokens.colors.background.tertiary}
              borderRadius={tokens.radii.small}
            >
              <View
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Text>{t('fileUpload.progress.uploading')}</Text>
                <Text>{Math.round(uploadProgress)}%</Text>
              </View>

              <View
                marginTop={tokens.space.small}
                height="4px"
                backgroundColor={tokens.colors.background.secondary}
                borderRadius={tokens.radii.small}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  style={{
                    height: '100%',
                    backgroundColor: tokens.colors.brand.primary,
                    borderRadius: tokens.radii.small
                  }}
                />
              </View>
            </View>
          </motion.div>
        )}
      </AnimatePresence>
    </View>
  );
};

FileUpload.displayName = 'FileUpload';

export default FileUpload;