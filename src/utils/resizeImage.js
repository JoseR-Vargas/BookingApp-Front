// ===== PROFILE PHOTO PREPARATION (SPEC 04) =====
// The admin picks any PNG, JPG or WebP up to 10 MB; the browser crops the centered square and
// shrinks it to a small JPEG before upload, so the photo is always square (round once styled),
// weighs a few KB and fits the backend limit of 200 KB without the admin editing anything.

export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const INVALID_PHOTO_MESSAGE = 'La foto debe ser PNG, JPG o WebP de hasta 10 MB.';
export const UNREADABLE_PHOTO_MESSAGE = 'No pudimos leer la imagen. Usa un PNG, JPG o WebP.';

/** Error message for a file that must not even be decoded, or null when it is acceptable. */
export function validatePhotoFile(file) {
  if (!file || !PHOTO_TYPES.includes(file.type) || file.size > MAX_ORIGINAL_BYTES) {
    return INVALID_PHOTO_MESSAGE;
  }
  return null;
}

/** Source rectangle of the centered square of a width x height image, in whole pixels. */
export function centerSquare(width, height) {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/**
 * Crops the centered square of `file` and returns it as a `size` x `size` JPEG data URL
 * ('data:image/jpeg;base64,...'). Transparent areas become white, since JPEG has no alpha.
 * Rejects with an Error whose message is ready to show to the admin.
 */
export async function resizeToSquareJpeg(file, { size = 256, quality = 0.85 } = {}) {
  const invalid = validatePhotoFile(file);
  if (invalid) throw new Error(invalid);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(UNREADABLE_PHOTO_MESSAGE);
  }

  try {
    const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close?.();
  }
}
