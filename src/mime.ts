import { extname } from 'node:path'

const MEDIA_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
}

const TEXT_CHARSET = new Set([
  'text/html',
  'text/css',
  'text/javascript',
  'text/plain',
  'application/json',
  'application/xml',
])

export function mediaTypeForPath(path: string): string {
  const ext = extname(path).toLowerCase()
  return MEDIA_TYPES[ext] ?? 'application/octet-stream'
}

export function contentTypeForPath(path: string): string {
  const type = mediaTypeForPath(path)
  return TEXT_CHARSET.has(type) ? `${type}; charset=utf-8` : type
}
