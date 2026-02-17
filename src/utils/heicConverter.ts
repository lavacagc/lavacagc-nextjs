import heic2any from 'heic2any';

/**
 * Converts HEIC/HEIF images to JPEG format
 * @param file - The file to potentially convert
 * @returns Promise<File> - Either the converted JPEG file or the original file
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  // Check if file is HEIC/HEIF format
  const isHeic = file.type === 'image/heic' || 
                 file.type === 'image/heif' || 
                 file.name.toLowerCase().endsWith('.heic') ||
                 file.name.toLowerCase().endsWith('.heif');
  
  if (!isHeic) {
    return file;
  }

  try {
    // Convert HEIC to JPEG blob with multiple fallback attempts
    let convertedBlob;
    
    try {
      // First attempt with high quality
      convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
      });
    } catch (firstError) {
      console.warn('First conversion attempt failed, trying with default settings:', firstError);
      // Second attempt with default settings
      convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg'
      });
    }

    // heic2any can return an array if multiple images, but we only expect single images
    const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    
    // Create a new File from the converted blob
    const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    const convertedFile = new File([blob], newFileName, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });

    return convertedFile;
  } catch (error) {
    console.error('All HEIC conversion attempts failed:', error);
    // Throw error with helpful message
    throw new Error('HEIC format not supported in your browser. Please convert HEIC files to JPG using your device\'s Photos app before uploading.');
  }
}

/**
 * Converts multiple HEIC/HEIF images to JPEG format
 * @param files - Array of files to potentially convert
 * @returns Promise<File[]> - Array of converted or original files
 */
export async function convertHeicFilesToJpeg(files: File[]): Promise<File[]> {
  const conversionPromises = files.map(file => convertHeicToJpeg(file));
  return Promise.all(conversionPromises);
}
