import express from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { SourceDownloader } from '../types';
import { ixdzsDownloader } from './downloader/ixdzs8.com';
import { ltxs5Downloader } from './downloader/ltxs5.net';

export const router = express.Router();

// 创建临时目录用于存储下载和处理的文件
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// 修改接口定义
interface DownloadRequest {
  format: string;
  source: string;
  bookId: string;
  coverUrl?: string;
  downloadConfig?: {
    concurrency?: number; // 并发数
    delay?: number; // 延迟时间(毫秒)
  };
}

// 源下载器映射
const sourceDownloaders: Record<string, SourceDownloader> = {
  ixdzs8: ixdzsDownloader,
  'ltxs5.net': ltxs5Downloader,
};



router.post('/', async (req, res) => {
  try {
    // 处理表单提交的数据
    let { format, source, bookId, coverUrl, downloadConfig } =
      req.body as DownloadRequest;

    console.log(
      `下载请求: 格式=${format}，书源=${source}，书籍ID=${bookId}，封面=${
        coverUrl || '无'
      }，配置=${JSON.stringify(downloadConfig || {})}`
    );

    // 为当前下载创建唯一的临时目录
    const sessionId = uuidv4();
    const sessionDir = path.join(tempDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    // 获取对应源的下载器
    const downloader = sourceDownloaders[source];
    if (!downloader) {
      throw new Error(`不支持的书源: ${source}`);
    }

    // 下载并转换书籍
    let result;
    try {
      result = await downloader.downloadAndConvert(
        bookId,
        format,
        sessionDir,
        coverUrl,
        downloadConfig
      );
    } catch (error) {
      throw error; // 错误已经在下载器中格式化过了
    }

    // 设置下载头
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(
        `${result.title}.${format}`
      )}`
    );
    const fileStream = fs.createReadStream(result.path);
    fileStream.pipe(res);

    // 设置定时清理临时文件
    setTimeout(() => {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (err) {
        console.error('清理临时文件失败:', err);
      }
    }, 1000 * 3); // 1分钟后清理
  } catch (error) {
    console.error('下载失败:', error);
    res.status(500).json({
      success: false,
      message: '下载失败',
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});
