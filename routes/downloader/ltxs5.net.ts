import path from 'path';
import fs from 'fs';
import axios from 'axios';
import iconv from 'iconv-lite';
import Epub from 'epub-gen';
import * as cheerio from 'cheerio';
import { SourceDownloader } from '../../types';
import { isImageUrlAccessible } from '../../utils';

interface Chapter {
  title: string;
  url: string;
  index: number;
  content?: string;
}

interface Ltxs5Downloader extends SourceDownloader {
  downloadBook: (
    bookId: string,
    sessionDir: string,
    downloadConfig?: { concurrency?: number; delay?: number }
  ) => Promise<{
    content: string;
    title: string;
    author: string;
    sortedChapters: Chapter[];
    coverUrl?: string;
  }>;
  downloadChapter: (
    chapter: Chapter,
    chaptersDir: string,
    delay: number
  ) => Promise<void>;
  mergeChapters: (
    chaptersDir: string,
    chapters: Chapter[],
    bookTitle: string,
    bookAuthor: string
  ) => Promise<{
    content: string;
    sortedChapters: Chapter[];
  }>;
  getChapterContent: (chapterUrl: string, delay?: number) => Promise<string>;
  convertToEpub: (
    chapters: Chapter[],
    title: string,
    author: string,
    coverUrl: string | undefined,
    outputPath: string
  ) => Promise<void>;
  convertToFormat: (
    bookData: {
      content: string;
      title: string;
      author: string;
      sortedChapters: Chapter[];
    },
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

export const ltxs5Downloader: Ltxs5Downloader = {
  async downloadBook(
    bookId: string,
    sessionDir: string,
    downloadConfig?: { concurrency?: number; delay?: number }
  ) {
    try {
      // 处理书籍ID，提取数字ID
      let bookNumId = bookId;
      if (bookId.includes('/')) {
        const matches = bookId.match(/\/(\d+)/);
        if (matches && matches[1]) {
          bookNumId = matches[1];
        }
      }

      // 构建详情页URL
      const bookUrl = `http://www.ltxs5.net/${bookNumId}/`;

      // 获取书籍详情页
      const bookResponse = await axios.get(bookUrl);
      console.log('书籍详情页请求状态码:', bookResponse.status);

      // 检查响应内容
      if (!bookResponse.data || typeof bookResponse.data !== 'string') {
        console.error('书籍详情页响应内容异常:', typeof bookResponse.data);
        throw new Error('获取书籍详情失败: 响应内容异常');
      }

      const $ = cheerio.load(bookResponse.data);

      // 提取书籍标题和作者
      const bookTitle = $('.bookTitle').text().split('/')[0].trim();
      const bookAuthor = $('.bookTitle small a').text().trim();

      // 获取封面图片URL
      const coverUrl = $('#bookIntro .img-thumbnail').attr('src');
      console.log('封面图片URL:', coverUrl);

      console.log(`书籍信息: 标题=${bookTitle}, 作者=${bookAuthor}`);

      if (!bookTitle) {
        console.error(
          '未能提取到书籍标题，HTML内容:',
          bookResponse.data.substring(0, 500) + '...'
        );
        throw new Error('解析书籍信息失败: 未能提取到标题');
      }

      // 获取所有章节链接
      let chapters: {
        title: string;
        url: string;
        content?: string;
        index: number;
      }[] = [];
      $('#list-chapterAll .panel-chapterlist .col-md-3').each(
        (index, element) => {
          const $element = $(element);
          const chapterTitle = $element.find('a').text().trim();
          const chapterUrl =
            'http://www.ltxs5.net' + $element.find('a').attr('href');
          chapters.push({ title: chapterTitle, url: chapterUrl, index });
        }
      );

      console.log(`获取到 ${chapters.length} 个章节`);

      if (chapters.length === 0) {
        console.error('未能提取到章节列表，检查选择器是否正确');
        throw new Error('解析章节列表失败: 未找到章节');
      }

      // 创建单个章节内容文件
      const chaptersContentPath = path.join(
        sessionDir,
        'chapters_content.json'
      );
      fs.writeFileSync(
        chaptersContentPath,
        JSON.stringify(
          {
            title: bookTitle,
            author: bookAuthor,
            totalChapters: chapters.length,
            chapters: {}, // 使用对象存储章节内容，键为章节索引
          },
          null,
          2
        )
      );

      // 创建进度文件
      const progressPath = path.join(sessionDir, 'progress.json');
      fs.writeFileSync(
        progressPath,
        JSON.stringify({
          total: chapters.length,
          current: 0,
          title: bookTitle,
          author: bookAuthor,
        })
      );

      // 设置并发数和延迟
      const concurrency = downloadConfig?.concurrency || 3; // 默认并发数为3
      const delay = downloadConfig?.delay || 500; // 默认延迟500ms

      console.log(`下载配置: 并发数=${concurrency}, 延迟=${delay}ms`);

      // 分批处理章节下载
      for (let i = 0; i < chapters.length; i += concurrency) {
        const batch = chapters.slice(i, i + concurrency);

        const promises = batch.map(chapter =>
          this.downloadChapter!(chapter, chaptersContentPath, delay)
        );

        // 等待当前批次完成
        const results = await Promise.allSettled(promises);

        // 更新进度
        let downloadedCount = i;
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            downloadedCount++;
          }
        });

        // 更新总进度
        fs.writeFileSync(
          progressPath,
          JSON.stringify({
            total: chapters.length,
            current: downloadedCount,
            title: bookTitle,
            author: bookAuthor,
          })
        );
      }

      console.log(`下载完成: ${chapters.length}/${chapters.length} (100%)`);

      // 合并所有章节内容生成最终文件
      const { content, sortedChapters } = await this.mergeChapters!(
        chaptersContentPath,
        chapters,
        bookTitle,
        bookAuthor
      );

      return {
        content,
        title: bookTitle,
        author: bookAuthor,
        sortedChapters,
        coverUrl,
      };
    } catch (error) {
      console.error('ltxs5.net下载失败:', error);
      throw new Error(
        `ltxs5.net下载失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`
      );
    }
  },

  // 下载单个章节
  async downloadChapter(
    chapter: Chapter,
    chaptersContentPath: string,
    delay: number
  ): Promise<void> {
    try {
      // 获取章节内容
      const chapterContent = await this.getChapterContent!(chapter.url, delay);

      // 读取现有章节内容文件
      const chaptersData = JSON.parse(
        fs.readFileSync(chaptersContentPath, 'utf-8')
      );

      // 添加新章节内容
      chaptersData.chapters[chapter.index] = {
        index: chapter.index,
        title: chapter.title,
        content: chapterContent,
      };

      // 写回文件
      fs.writeFileSync(
        chaptersContentPath,
        JSON.stringify(chaptersData, null, 2)
      );

      return Promise.resolve();
    } catch (error) {
      console.error(`章节下载失败: [${chapter.index}] ${chapter.title}`, error);
      return Promise.reject(error);
    }
  },

  // 合并所有章节
  async mergeChapters(
    chaptersContentPath: string,
    chapters: Chapter[],
    bookTitle: string,
    bookAuthor: string
  ): Promise<{
    content: string;
    sortedChapters: Chapter[];
  }> {
    let fullContent = `《${bookTitle}》\n作者：${bookAuthor}\n\n------章节内容开始-------\n\n`;

    // 读取章节内容文件
    const chaptersData = JSON.parse(
      fs.readFileSync(chaptersContentPath, 'utf-8')
    );

    // 按章节索引排序
    const sortedChapters = [...chapters].sort((a, b) => a.index - b.index);

    for (const chapter of sortedChapters) {
      const chapterData = chaptersData.chapters[chapter.index];

      if (chapterData && chapterData.content) {
        fullContent += `${chapterData.title}\n\n${chapterData.content}\n\n`;
      } else {
        fullContent += `${chapter.title}\n\n[获取章节内容失败]\n\n`;
      }
    }

    return {
      content: fullContent,
      sortedChapters: Object.values(chaptersData.chapters),
    };
  },

  // 获取章节内容，包括处理分页
  async getChapterContent(
    chapterUrl: string,
    delay: number = 300
  ): Promise<string> {
    let fullContent = '';
    let currentUrl = chapterUrl;
    let hasNextPage = true;

    while (hasNextPage) {
      try {
        const response = await axios.get(currentUrl);

        if (!response.data || typeof response.data !== 'string') {
          console.error('章节内容响应异常:', typeof response.data);
          throw new Error('获取章节内容失败: 响应内容异常');
        }

        const $ = cheerio.load(response.data);

        // 获取当前页内容
        const content = $('#bookcontent').html() || '';

        if (!content) {
          console.error('未能提取到章节内容，检查选择器是否正确');
          throw new Error('解析章节内容失败: 未找到内容');
        }

        // 检查是否有下一页 - 在清理内容前先检查
        const nextLink = $('#next_url');
        hasNextPage = nextLink.text().includes('下一页');

        if (hasNextPage) {
          // 构建下一页URL
          if (currentUrl.includes('_')) {
            // 已经是分页的情况，如 /86692/2196240_2.html
            const pageNumMatch = currentUrl.match(/_(\d+)\.html$/);
            if (pageNumMatch) {
              const pageNum = parseInt(pageNumMatch[1], 10);
              currentUrl = currentUrl.replace(
                `_${pageNum}.html`,
                `_${pageNum + 1}.html`
              );
            }
          } else {
            // 第一页到第二页，如 /86692/2196240.html 到 /86692/2196240_2.html
            currentUrl = currentUrl.replace('.html', '_2.html');
          }
        }

        // 清理HTML标签前先移除分页导航元素
        const $content = cheerio.load(content);
        $content('.readPager').remove(); // 移除所有class为readPager的元素

        // 清理HTML标签
        let cleanContent = $content
          .html()
          .replace(/<br\s*\/?>/gi, '\n') // 替换<br>为换行
          .replace(/<\/p>\s*<p>/gi, '\n\n') // 替换</p><p>为两个换行符
          .replace(/<p>/gi, '') // 移除开始的p标签
          .replace(/<\/p>/gi, '\n') // 替换结束的p标签为换行
          .replace(/<\/?[^>]+(>|$)/g, '') // 移除所有其他HTML标签
          .replace(/&nbsp;/g, ' ') // 替换&nbsp;为空格
          .trim();

        fullContent += cleanContent + '\n';

        // 避免请求过快
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`获取章节内容失败 ${currentUrl}:`, error);
        break;
      }
    }

    return fullContent;
  },

  async convertToFormat(bookData, format, sessionDir, coverUrl) {
     switch (format.toLowerCase()) {
      case 'txt': {
        const outputPath = path.join(sessionDir, `${bookData.title}.txt`);
        // 内容需要特殊处理，确保编码正确
        const utf8Content = iconv.encode(bookData.content, 'utf-8');
        fs.writeFileSync(outputPath, utf8Content);
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
          bookData.sortedChapters,
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
    chapters: Chapter[],
    title: string,
    author: string,
    coverUrl: string | undefined,
    outputPath: string
  ): Promise<void> {
    const options = {
      title: title,
      author: author,
      cover: (await isImageUrlAccessible(coverUrl)) ? coverUrl : undefined,
      tocTitle: '',
      content: Object.values(chapters)
        .sort((a, b) => a.index - b.index)
        .map(chapter => ({
          title: chapter.title,
          data: `<p>${chapter.content?.split('\n').join('</p><p>')}</p>`,
        })),
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
      return await this.convertToFormat(bookData, format, sessionDir, bookData.coverUrl);
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
