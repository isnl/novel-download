import axios from 'axios';
import * as cheerio from 'cheerio';

interface IXDZSBook {
  title: string;
  author: string;
  url: string;
  cover?: string;
  description?: string;
  wordCount?: string;
  status?: string;
  latestChapter?: string;
  updateTime?: string;
}

export async function searchBooks(keyword: string): Promise<IXDZSBook[]> {
  try {
    const response = await axios.get(`https://ixdzs8.com/bsearch?q=${encodeURIComponent(keyword)}`);
    const $ = cheerio.load(response.data);
    const books: IXDZSBook[] = [];

    // 解析搜索结果
    $('.panel ul li.burl').each((_, element) => {
      const $element = $(element);
      const book: IXDZSBook = {
        title: $element.find('.bname a').text().trim(),
        author: $element.find('.bauthor a').text().trim(),
        url: 'https://ixdzs8.com' + $element.find('.bname a').attr('href'),
        cover: $element.find('.l-img img').attr('src'),
        description: $element.find('.l-p2').text().trim(),
        wordCount: $element.find('.size').text().trim(),
        status: $element.find('.lz').text().trim(),
        latestChapter: $element.find('.l-chapter').text().trim(),
        updateTime: $element.find('.l-time').text().trim()
      };
      books.push(book);
    });

    return books;
  } catch (error) {
    console.error('爱下电子书搜索失败:', error);
    return [];
  }
} 