import express from "express";
import { searchBooks as searchIXDZS } from "./sources/ixdzs";

export const router = express.Router();

router.get("/search", async (req, res) => {
  const searchQuery = req.query.q as string;
  const sourceId = req.query.source as string;

  if (!searchQuery || !sourceId) {
    return res.status(400).json({ error: "缺少必要参数" });
  }

  try {
    // 定义所有书源
    const sources: any = {
      "ixdzs8": searchIXDZS,
      "fanqie": async () => [] // 暂时返回空数组，等待实现
    };

    // 检查书源是否存在
    if (!sources[sourceId]) {
      return res.status(404).json({ error: "未找到指定书源" });
    }

    // 执行搜索
    const books = await sources[sourceId](searchQuery);
    
    // 返回结果
    res.json({
      source: sourceId,
      books
    });
  } catch (error) {
    console.error("API 搜索失败:", error);
    res.status(500).json({ error: "搜索过程中发生错误" });
  }
}); 