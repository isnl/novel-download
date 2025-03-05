import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';
import { v4 as uuidv4 } from 'uuid';
import Epub from 'epub-gen';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { exec } from 'child_process';

const execAsync = promisify(exec);

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
}

// 添加检查封面URL是否可访问的函数
async function isImageUrlAccessible(url?: string): Promise<boolean> {
  if (!url) return false;
  try {
    const response = await axios.head(url);
    const contentType = response.headers['content-type'];
    return response.status === 200 && contentType?.startsWith('image/');
  } catch (error) {
    console.warn('封面图片访问失败:', error instanceof Error ? error.message : '未知错误');
    return false;
  }
}

router.post('/', async (req, res) => {
  try {
    // 处理表单提交的数据
    let { format, source, bookId, coverUrl } = req.body as DownloadRequest;

    console.log(
      `下载请求: 格式=${format}，书源=${source}，书籍ID=${bookId}，封面=${
        coverUrl || '无'
      }`
    );

    // 处理书籍ID，提取数字ID
    let bookNumId = bookId;
    if (bookId.includes('/')) {
      // 从URL中提取ID，例如从 https://ixdzs8.com/read/537305/ 提取 537305
      const matches = bookId.match(/\/(\d+)/);
      if (matches && matches[1]) {
        bookNumId = matches[1];
      }
    }

    // 为当前下载创建唯一的临时目录
    const sessionId = uuidv4();
    const sessionDir = path.join(tempDir, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    // 构建下载URL
    const zipUrl = `https://down7.ixdzs8.com/${bookNumId}.zip`;
    const zipPath = path.join(sessionDir, `${bookNumId}.zip`);

    // 下载zip文件
    const response = await axios({
      method: 'GET',
      url: zipUrl,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(zipPath);
    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });

    // 解压zip文件
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(sessionDir, true);

    // 查找解压后的txt文件
    const files = fs.readdirSync(sessionDir);
    const txtFile = files.find(file => file.endsWith('.txt'));

    if (!txtFile) {
      throw new Error('解压后未找到TXT文件');
    }

    const txtPath = path.join(sessionDir, txtFile);

    // 读取文件内容并转换为UTF-8
    const content = fs.readFileSync(txtPath);
    const decodedContent = iconv.decode(content, 'gb2312');

    // 清理广告文本
    const cleanedContent = decodedContent
      .replace(
        /更多电子书请访问爱下电子书,简体:https:\/\/ixdzs8\.com;繁体:https:\/\/ixdzs8\.tw/g,
        ''
      )
      .replace(
        /爱下电子书Txt版阅读,下载和分享更多电子书请访问，简体:https:\/\/ixdzs8\.com,繁体:https:\/\/ixdzs8\.tw,E-mail:support@ixdzs\.com/g,
        ''
      )
      .trim();

    // 提取书名和作者（从文件名或内容的第一行）
    const firstLine = cleanedContent.split('\n')[0];
    const titleMatch = firstLine.match(/《(.+?)》/);
    const authorMatch = firstLine.match(/作者[：:]\s*(.+)/);

    const bookTitle = titleMatch ? titleMatch[1] : txtFile.replace('.txt', '');
    const bookAuthor = authorMatch ? authorMatch[1] : '未知作者';

    // 处理单个格式的转换和下载
    let result;
    try {
      switch (format.toLowerCase()) {
        case 'txt': {
          const outputPath = path.join(sessionDir, `${bookTitle}.txt`);
          const utf8Content = iconv.encode(cleanedContent, 'utf-8');
          fs.writeFileSync(outputPath, utf8Content);
          result = {
            format: 'txt',
            path: outputPath,
            success: true,
            title: bookTitle,
          };
          break;
        }
        case 'epub': {
          const outputPath = path.join(sessionDir, `${bookTitle}.epub`);

          // 解析文本内容
          const lines = cleanedContent.split('\n');
          let title = '';
          let author = '';
          let introduction = '';
          let chapters = [];
          let currentChapter = null;
          let currentContent = [];

          // 解析标题和作者
          const titleMatch = lines[0].match(/『(.+)\/作者:(.+)』/);
          if (titleMatch) {
            title = titleMatch[1];
            author = titleMatch[2];
          }

          // 解析简介
          const introStart = lines.findIndex(line =>
            line.includes('『内容简介:')
          );
          const introEnd = lines.findIndex(line =>
            line.includes('------章节内容开始-------')
          );
          if (introStart !== -1 && introEnd !== -1) {
            introduction = lines
              .slice(introStart + 1, introEnd)
              .join('\n')
              .replace(/『|』/g, '')
              .trim();
          }

          // 解析章节，只识别以"第X章"开头的行作为章节标题
          for (let i = introEnd + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.match(/^第[0-9一二三四五六七八九十百千]+章/)) {
              // 保存上一章节
              if (currentChapter) {
                chapters.push({
                  title: currentChapter,
                  data: currentContent.join('\n'),
                });
              }
              // 开始新章节
              currentChapter = line;
              currentContent = [];
            } else if (line && currentChapter) {
              currentContent.push(line);
            }
          }

          // 添加最后一章
          if (currentChapter && currentContent.length > 0) {
            chapters.push({
              title: currentChapter,
              data: currentContent.join('\n'),
            });
          }

          const options = {
            title: title || bookTitle,
            author: author || bookAuthor,
            cover: await isImageUrlAccessible(coverUrl) ? coverUrl : undefined,
            tocTitle: '',
            content: [
              {
                title: '简介',
                data: `<p>${introduction}</p>`,
              },
              ...chapters.map(chapter => ({
                title: chapter.title,
                data: `<p>${chapter.data.split('\n').join('</p><p>')}</p>`,
              })),
            ],
            css: `
              body { font-family: "Microsoft YaHei", sans-serif; line-height: 1.8; }
              h1 { text-align: center; margin: 1em 0; }
              p { text-indent: 2em; margin: 0.8em 0; }
            `,
          };

          try {
            await new Epub(options, outputPath).promise;
            result = { format: 'epub', path: outputPath, success: true, title };
          } catch (error: any) {
            throw new Error(`EPUB 转换失败: ${error.message}`);
          }
          break;
        }
        default:
          throw new Error('不支持的格式');
      }
    } catch (error) {
      throw new Error(
        `转换失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
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
    }, 3600000); // 1小时后清理
  } catch (error) {
    console.error('下载失败:', error);
    res.status(500).json({
      success: false,
      message: '下载失败',
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});
