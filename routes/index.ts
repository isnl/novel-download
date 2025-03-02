import express from 'express';

export const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', {
    title: '首页',
    content: '欢迎来到Express + TypeScript项目'
  });
}); 