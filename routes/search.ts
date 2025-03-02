import express from 'express';
import { searchBooks as searchIXDZS } from './sources/ixdzs';

export const router = express.Router();

router.get('/', async (req, res) => {
  const searchQuery = req.query.q as string || '';
  const source = req.query.source as string || 'ixdzs';
  
  try {
    let books:any = [];
    
    switch (source) {
      case 'ixdzs':
        books = await searchIXDZS(searchQuery);
        break;
      default:
        books = [];
    }
    
    res.render('search', {
      title: searchQuery ? `搜索结果 - ${searchQuery}` : '搜索',
      searchQuery,
      books,
      source
    });
  } catch (error) {
    console.error('搜索失败:', error);
    res.status(500).render('error', {
      message: '搜索失败，请稍后重试'
    });
  }
}); 