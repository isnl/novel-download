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

export const router = express.Router();

interface DownloadRequest {
  formats: string[] | string;
  source: string;
  bookId: string;
  coverUrl?: string;  // 添加可选的封面URL字段
}

// 创建临时目录用于存储下载和处理的文件
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

router.post('/', async (req, res) => {
  try {
    // 处理表单提交的数据
    let { formats, source, bookId, coverUrl } = req.body as DownloadRequest;
    
    // 确保formats是数组
    if (!Array.isArray(formats)) {
      formats = formats ? [formats] : [];
    }
    
    console.log(`下载请求: 格式=${formats.join(',')}，书源=${source}，书籍ID=${bookId}，封面=${coverUrl || '无'}`);

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
      responseType: 'stream'
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
      .replace(/更多电子书请访问爱下电子书,简体:https:\/\/ixdzs8\.com;繁体:https:\/\/ixdzs8\.tw/g, '')
      .replace(/爱下电子书Txt版阅读,下载和分享更多电子书请访问，简体:https:\/\/ixdzs8\.com,繁体:https:\/\/ixdzs8\.tw,E-mail:support@ixdzs\.com/g, '')
      .trim();
    
    // 处理不同格式的转换和下载
    const results = await Promise.all(formats.map(async format => {
      try {
        switch (format.toLowerCase()) {
          case 'txt': {
            const outputPath = path.join(sessionDir, `${bookNumId}.txt`);
            const utf8Content = iconv.encode(cleanedContent, 'utf-8');
            fs.writeFileSync(outputPath, utf8Content);
            return { format: 'txt', path: outputPath, success: true };
          }
          case 'epub': {
            const outputPath = path.join(sessionDir, `${bookNumId}.epub`);
            
            // 提取书名和作者（从文件名或内容的第一行）
            const firstLine = cleanedContent.split('\n')[0];
            const titleMatch = firstLine.match(/《(.+?)》/);
            const authorMatch = firstLine.match(/作者[：:]\s*(.+)/);
            
            const title = titleMatch ? titleMatch[1] : txtFile.replace('.txt', '');
            const author = authorMatch ? authorMatch[1] : '未知作者';
            
            // 创建EPUB
            await new Epub({
              title,
              author,
              publisher: '小说下载器',
              cover: coverUrl,
              content: [{
                title: title,
                data: cleanedContent.split('\n\n')
                  .map(paragraph => `<p>${paragraph.trim()}</p>`)
                  .join('\n')
              }]
            }, outputPath).promise;
            
            return { format: 'epub', path: outputPath, success: true };
          }
          // 在文件顶部添加 execAsync 定义
          const execAsync = promisify(exec);
          
          // 修改 PDF 部分的代码
          case 'pdf': {
            const outputPath = path.join(sessionDir, `${bookNumId}.pdf`);
            
            // 创建PDF文档
            const pdfDoc = await PDFDocument.create();
            
            // 使用思源宋体（开源中文字体）
            const fontData = fs.readFileSync(path.join(__dirname, '../fonts/SourceHanSerifCN-Regular.ttf'));
            const font = await pdfDoc.embedFont(fontData);
            
            // 分页处理
            const lines = cleanedContent.split('\n');
            const linesPerPage = 40;
            const margin = 50;
            const fontSize = 12;
            const lineHeight = 20;
            
            for (let i = 0; i < lines.length; i += linesPerPage) {
              const page = pdfDoc.addPage([595, 842]); // A4 大小
              const { width, height } = page.getSize();
              
              const pageLines = lines.slice(i, i + linesPerPage);
              pageLines.forEach((line, index) => {
                if (line.trim()) {  // 只处理非空行
                  page.drawText(line.trim(), {
                    x: margin,
                    y: height - margin - (index * lineHeight),
                    font,
                    size: fontSize
                  });
                }
              });
            }
            
            // 保存PDF文件
            const pdfBytes = await pdfDoc.save();
            fs.writeFileSync(outputPath, pdfBytes);
            
            return { format: 'pdf', path: outputPath, success: true };
          }
          default:
            return { format, success: false, error: '不支持的格式' };
        }
      } catch (error) {
        return { format, success: false, error: error instanceof Error ? error.message : '转换失败' };
      }
    }));

    // 检查是否有成功转换的格式
    const successResults = results.filter(r => r.success);
    if (successResults.length === 0) {
      throw new Error('没有成功转换的格式: ' + results.map(r => `${r.format}(${r.error})`).join(', '));
    }
    
    // 如果只有一个格式，直接下载
    if (successResults.length === 1) {
      const result: any = successResults[0];
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(`${bookNumId}.${result.format}`)}`);
      const fileStream = fs.createReadStream(result.path);
      fileStream.pipe(res);
    } else {
      // 如果有多个格式，创建zip文件
      const zip = new AdmZip();
      successResults.forEach((result: any) => {
        zip.addLocalFile(result.path, '', `${bookNumId}.${result.format}`);
      });
      
      const zipPath = path.join(sessionDir, `${bookNumId}_all.zip`);
      zip.writeZip(zipPath);
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(`${bookNumId}_all.zip`)}`);
      const fileStream = fs.createReadStream(zipPath);
      fileStream.pipe(res);
    }
    
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
      error: error instanceof Error ? error.message : '未知错误'
    });
  }
});