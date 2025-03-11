export interface SourceDownloader {
  downloadAndConvert: (
    bookId: string,
    format: string,
    sessionDir: string,
    coverUrl?: string,
    downloadConfig?: { concurrency?: number; delay?: number }
  ) => Promise<{
    format: string;
    path: string;
    success: boolean;
    title: string;
  }>;
}
