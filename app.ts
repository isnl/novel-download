import express from 'express';
import path from 'path';
import { router as indexRouter } from './routes/index';
import { router as searchRouter } from './routes/search';

const app = express();
const port = 5020;

// 设置视图引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 开发环境禁用视图缓存
if (process.env.NODE_ENV !== 'production') {
  app.disable('view cache');
}

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.use('/', indexRouter);
app.use('/search', searchRouter);

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});

export default app;
