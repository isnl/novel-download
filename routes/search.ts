import express from "express";
import { searchBooks as searchIXDZS } from "./sources/ixdzs";
import { searchBooks as searchLTXS5 } from "./sources/ltxs5.net";
export const router = express.Router();

interface SearchResult {
  source: string;
  books: any[];
}

type SourceId = "ixdzs8" | "fanqie" | "ltxs5.net";

// 页面渲染路由
router.get("/", async (req, res) => {
  const searchQuery = req.query.q as string;

  if (!searchQuery) {
    return res.render("search", {
      title: "搜索小说",
      searchQuery: "",
      results: [],
      activeSource: "ixdzs8",
    });
  }

  try {
    // 定义所有书源
    const sources = [
      {
        id: "ixdzs8",
        name: "爱下电子书",
      },
      {
        id: "ltxs5.net",
        name: "52书库",
      },
    ];

    // 获取当前激活的书源
    const activeSource = (req.query.source as string) || "ixdzs8";

    // 直接渲染页面，不等待搜索结果
    res.render("search", {
      title: `搜索：${searchQuery}`,
      searchQuery,
      activeSource,
      sources,
    });
  } catch (error) {
    console.error("搜索失败:", error);
    res.render("search", {
      title: "搜索失败",
      searchQuery,
      error: "搜索过程中发生错误",
      activeSource: "ixdzs8",
      sources: [],
    });
  }
});

// API 搜索路由
router.get("/api", async (req, res) => {
  const searchQuery = req.query.q as string;
  const sourceId = req.query.source as SourceId;

  if (!searchQuery || !sourceId) {
    return res.status(400).json({ error: "缺少必要参数" });
  }

  try {
    // 定义所有书源
    const sources = {
      ixdzs8: searchIXDZS,
      fanqie: async () => [], // 暂时返回空数组，等待实现
      "ltxs5.net": searchLTXS5,
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
      books,
    });
  } catch (error) {
    console.error("API 搜索失败:", error);
    res.status(500).json({ error: "搜索过程中发生错误" });
  }
});
