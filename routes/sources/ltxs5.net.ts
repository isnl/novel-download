import axios from 'axios';
import * as cheerio from 'cheerio';

interface LTXS5Book {
  title: string;
  author: string;
  url: string;
  description?: string;
}

export async function searchBooks(keyword: string): Promise<LTXS5Book[]> {
  try {
    const response = await axios.get(`http://www.ltxs5.net/search/?searchkey=${encodeURIComponent(keyword)}&searchtype=all`);
    const $ = cheerio.load(response.data);
    const books: LTXS5Book[] = [];

    // 解析搜索结果
    $('.panel-body .row .book-coverlist').each((_, element) => {
      const $element = $(element);
      const book: LTXS5Book = {
        title: $element.find('.caption h4 a').text().trim(),
        author: $element.find('.caption small.text-muted a').text().trim(),
        url: 'http://www.ltxs5.net' + $element.find('.caption h4 a').attr('href'),
        description: $element.find('.caption p.text-muted').text().trim()
      };
      books.push(book);
    });

    return books;
  } catch (error) {
    console.error('龙腾小说网搜索失败:', error);
    return [];
  }
}
