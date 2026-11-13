export const IDEA_MEDIA_MAX_FILES = 8
export const IDEA_MEDIA_MAX_FILE_SIZE = 25 * 1024 * 1024
export const IDEA_MEDIA_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const

const ideaMediaMimeTypes = new Set<string>(IDEA_MEDIA_MIME_TYPES)

export function isIdeaVideo(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

export function validateIdeaMediaFiles(
  files: readonly Pick<File, 'name' | 'size' | 'type'>[],
  existingCount = 0,
): string | null {
  if (existingCount + files.length > IDEA_MEDIA_MAX_FILES) {
    return `Add up to ${IDEA_MEDIA_MAX_FILES} images or videos to an idea.`
  }
  for (const file of files) {
    if (!ideaMediaMimeTypes.has(file.type)) {
      return `${file.name || 'This file'} is not a supported image or video.`
    }
    if (file.size > IDEA_MEDIA_MAX_FILE_SIZE) {
      return `${file.name || 'Each file'} must be 25 MB or smaller.`
    }
  }
  return null
}
