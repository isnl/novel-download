import path from 'path';
import fs from 'fs';
import axios from 'axios';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import { v4 as uuidv4 } from 'uuid';
import Epub from 'epub-gen';
import { SourceDownloader } from '../../types';
import { isImageUrlAccessible } from '../../utils';

interface IxdzsDownloader extends SourceDownloader {
  downloadBook: (
    bookId: string,
    sessionDir: string,
    downloadConfig?: { concurrency?: number; delay?: number }
  ) => Promise<{
    content: string;
    title: string;
    author: string;
  }>;
  convertToEpub: (
    content: string,
    title: string,
    author: string,
    coverUrl: string | undefined,
    outputPath: string
  ) => Promise<void>;
  convertToFormat: (
    bookData: { content: string; title: string; author: string },
    format: string,
    sessionDir: string,
    coverUrl?: string
  ) => Promise<{
    format: string;
    path: string;
    success: boolean;
    title: string;
  }>;
}

export const ixdzsDownloader: IxdzsDownloader = {
  async downloadBook(bookId: string, sessionDir: string) {
    // 处理书籍ID，提取数字ID
    let bookNumId = bookId;
    if (bookId.includes('/')) {
      // 从URL中提取ID，例如从 https://ixdzs8.com/read/537305/ 提取 537305
      const matches = bookId.match(/\/(\d+)/);
      if (matches && matches[1]) {
        bookNumId = matches[1];
      }
    }

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

    return {
      content: cleanedContent,
      title: bookTitle,
      author: bookAuthor,
    };
  },

  async convertToFormat(bookData, format, sessionDir, coverUrl) {
    switch (format.toLowerCase()) {
      case 'txt': {
        const outputPath = path.join(sessionDir, `${bookData.title}.txt`);
        // 爱下电子书的内容已经是UTF-8，直接写入
        fs.writeFileSync(outputPath, bookData.content);
        return {
          format: 'txt',
          path: outputPath,
          success: true,
          title: bookData.title,
        };
      }
      case 'epub': {
        const outputPath = path.join(sessionDir, `${bookData.title}.epub`);
        await this.convertToEpub(
          bookData.content,
          bookData.title,
          bookData.author,
          coverUrl,
          outputPath
        );
        return {
          format: 'epub',
          path: outputPath,
          success: true,
          title: bookData.title,
        };
      }
      default:
        throw new Error('不支持的格式');
    }
  },
  // 处理EPUB转换
  async convertToEpub(
    content: string,
    title: string,
    author: string,
    coverUrl: string | undefined,
    outputPath: string
  ): Promise<void> {
    // 解析文本内容
    const lines = content.split('\n');
    let introduction = '';
    let chapters = [];
    let currentChapter = null;
    let currentContent = [];

    // 解析简介
    const introStart = lines.findIndex(line => line.includes('『内容简介:'));
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
      title: title,
      author: author,
      cover: (await isImageUrlAccessible(coverUrl)) ? coverUrl : undefined,
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
    } catch (error: any) {
      throw new Error(`EPUB 转换失败: ${error.message}`);
    }
  },

  async downloadAndConvert(
    bookId,
    format,
    sessionDir,
    coverUrl,
    downloadConfig
  ) {
    try {
      // 下载书籍内容
      const bookData = await this.downloadBook(
        bookId,
        sessionDir,
        downloadConfig
      );

      // 转换格式
      return await this.convertToFormat(bookData, format, sessionDir, coverUrl);
    } catch (error) {
      if (error instanceof Error && error.message.includes('转换失败')) {
        throw error; // 如果已经是转换错误，直接抛出
      }
      throw new Error(
        `书籍下载失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  },
};
