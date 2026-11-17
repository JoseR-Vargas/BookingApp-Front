import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ORIGINAL_BYTES,
  INVALID_PHOTO_MESSAGE,
  UNREADABLE_PHOTO_MESSAGE,
  centerSquare,
  resizeToSquareJpeg,
  validatePhotoFile,
} from './resizeImage.js';

const file = (type, size = 1024) => new File([new Uint8Array(size)], 'photo', { type });

describe('validatePhotoFile', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(validatePhotoFile(file(type))).toBeNull();
  });

  it('accepts a file of exactly 10 MB', () => {
    expect(validatePhotoFile(file('image/jpeg', MAX_ORIGINAL_BYTES))).toBeNull();
  });

  it.each(['image/svg+xml', 'image/heic', 'image/gif', 'application/pdf', ''])('rejects the type "%s"', (type) => {
    expect(validatePhotoFile(file(type))).toBe(INVALID_PHOTO_MESSAGE);
  });

  it('rejects a file over 10 MB', () => {
    expect(validatePhotoFile(file('image/jpeg', MAX_ORIGINAL_BYTES + 1))).toBe(INVALID_PHOTO_MESSAGE);
  });

  it('rejects a missing file', () => {
    expect(validatePhotoFile(null)).toBe(INVALID_PHOTO_MESSAGE);
  });
});

describe('centerSquare', () => {
  it('crops the centered square of a landscape image', () => {
    expect(centerSquare(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 });
  });

  it('crops the centered square of a portrait image', () => {
    expect(centerSquare(200, 400)).toEqual({ sx: 0, sy: 100, side: 200 });
  });

  it('keeps a square image whole', () => {
    expect(centerSquare(300, 300)).toEqual({ sx: 0, sy: 0, side: 300 });
  });

  it('rounds the offset to whole pixels', () => {
    expect(centerSquare(301, 200)).toEqual({ sx: 50, sy: 0, side: 200 });
  });
});

describe('resizeToSquareJpeg', () => {
  const fakeCanvas = () => {
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toDataURL: vi.fn(() => 'data:image/jpeg;base64,AAAA') };
    vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : document.createElementNS('http://www.w3.org/1999/xhtml', tag)));
    return { canvas, context };
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws the centered square on a white 256x256 canvas and returns a JPEG data URL', async () => {
    const { canvas, context } = fakeCanvas();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200, close })));

    const result = await resizeToSquareJpeg(file('image/png'));

    expect(result).toBe('data:image/jpeg;base64,AAAA');
    expect([canvas.width, canvas.height]).toEqual([256, 256]);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 256, 256);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 200, 200, 0, 0, 256, 256);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    expect(close).toHaveBeenCalled();
  });

  it('honors a custom size and quality', async () => {
    const { canvas } = fakeCanvas();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })));

    await resizeToSquareJpeg(file('image/webp'), { size: 128, quality: 0.5 });

    expect([canvas.width, canvas.height]).toEqual([128, 128]);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.5);
  });

  it('rejects an invalid file without trying to decode it', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);

    await expect(resizeToSquareJpeg(file('image/svg+xml'))).rejects.toThrow(INVALID_PHOTO_MESSAGE);
    expect(decode).not.toHaveBeenCalled();
  });

  it('says the image cannot be read when the browser cannot decode it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode failed'); }));

    await expect(resizeToSquareJpeg(file('image/jpeg'))).rejects.toThrow(UNREADABLE_PHOTO_MESSAGE);
  });
});
