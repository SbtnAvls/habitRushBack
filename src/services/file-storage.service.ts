import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * File Storage Service
 * Handles storing proof images on disk instead of in the database
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'proofs');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Validate filename to prevent path traversal attacks
 * Only allows alphanumeric, dashes, underscores, and dots (for extension)
 */
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;

/**
 * Validate that a file path is safe and stays within UPLOAD_DIR
 * Prevents path traversal attacks (e.g., ../../../etc/passwd)
 */
function isValidFilePath(filePath: string): boolean {
  // Check for null/undefined/empty
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check filename format (no path separators, only safe characters)
  if (!SAFE_FILENAME_REGEX.test(filePath)) {
    console.error('[FileStorage] Invalid filename format:', filePath);
    return false;
  }

  // Double-check: resolve full path and ensure it's within UPLOAD_DIR
  const resolvedPath = path.resolve(UPLOAD_DIR, filePath);
  const normalizedUploadDir = path.resolve(UPLOAD_DIR);

  if (!resolvedPath.startsWith(normalizedUploadDir + path.sep)) {
    console.error('[FileStorage] Path traversal attempt detected:', filePath);
    return false;
  }

  return true;
}

/**
 * Supported image MIME types
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return mimeToExt[mimeType] || 'jpg';
}

/**
 * Parse base64 data URL
 */
function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

/**
 * Save a base64 image to disk
 * @returns The file path relative to UPLOAD_DIR, or null if failed
 */
export async function saveProofImage(
  base64DataUrl: string,
  userId: string,
): Promise<{ filePath: string; fullPath: string } | null> {
  try {
    const parsed = parseDataUrl(base64DataUrl);
    if (!parsed) {
      console.error('[FileStorage] Invalid data URL format');
      return null;
    }

    if (!ALLOWED_MIME_TYPES.includes(parsed.mimeType)) {
      console.error('[FileStorage] Unsupported MIME type:', parsed.mimeType);
      return null;
    }

    const extension = getExtensionFromMime(parsed.mimeType);
    const filename = `${userId}_${crypto.randomUUID()}.${extension}`;
    const fullPath = path.join(UPLOAD_DIR, filename);

    // Decode base64 and write to file
    const buffer = Buffer.from(parsed.base64Data, 'base64');
    await fs.promises.writeFile(fullPath, buffer);

    console.info('[FileStorage] Saved proof image:', filename);

    return {
      filePath: filename,
      fullPath,
    };
  } catch (error) {
    console.error('[FileStorage] Error saving image:', error);
    return null;
  }
}

/**
 * Load a proof image from disk as base64 data URL
 * Used for AI validation
 */
export async function loadProofImageAsBase64(filePath: string): Promise<string | null> {
  try {
    // SECURITY: Validate file path to prevent path traversal
    if (!isValidFilePath(filePath)) {
      console.error('[FileStorage] Security: Invalid file path rejected:', filePath);
      return null;
    }

    const fullPath = path.join(UPLOAD_DIR, filePath);

    if (!fs.existsSync(fullPath)) {
      console.error('[FileStorage] File not found:', filePath);
      return null;
    }

    const buffer = await fs.promises.readFile(fullPath);
    const base64 = buffer.toString('base64');

    // Determine MIME type from extension
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const extToMime: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const mimeType = extToMime[ext] || 'image/jpeg';

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('[FileStorage] Error loading image:', error);
    return null;
  }
}

/**
 * Delete a proof image from disk
 */
export async function deleteProofImage(filePath: string): Promise<boolean> {
  try {
    // SECURITY: Validate file path to prevent path traversal
    if (!isValidFilePath(filePath)) {
      console.error('[FileStorage] Security: Invalid file path rejected for deletion:', filePath);
      return false;
    }

    const fullPath = path.join(UPLOAD_DIR, filePath);

    if (!fs.existsSync(fullPath)) {
      return true; // Already deleted
    }

    await fs.promises.unlink(fullPath);
    console.info('[FileStorage] Deleted proof image:', filePath);
    return true;
  } catch (error) {
    console.error('[FileStorage] Error deleting image:', error);
    return false;
  }
}

/**
 * Get the full URL for a proof image (for serving via HTTP)
 */
export function getProofImageUrl(filePath: string): string {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/uploads/proofs/${filePath}`;
}

/**
 * Check if a value is a stored file path (not a data URL or external URL)
 * Stored file paths follow the pattern: alphanumeric_dash.extension
 * Example: abc123_def456.jpg
 */
export function isStoredFilePath(value: string): boolean {
  // Not a data URL
  if (value.startsWith('data:')) {
    return false;
  }

  // Not an external URL
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return false;
  }

  // Should match our safe filename pattern
  // This prevents false positives with random strings
  return SAFE_FILENAME_REGEX.test(value);
}

export const fileStorageService = {
  saveProofImage,
  loadProofImageAsBase64,
  deleteProofImage,
  getProofImageUrl,
  isStoredFilePath,
  UPLOAD_DIR,
};
