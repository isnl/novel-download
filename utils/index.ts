import axios from 'axios';

export async function isImageUrlAccessible(url?: string): Promise<boolean> {
  if (!url) return false;
  try {
    const response = await axios.head(url);
    const contentType = response.headers['content-type'];
    return response.status === 200 && contentType?.startsWith('image/');
  } catch (error) {
    console.warn(
      '封面图片访问失败:',
      error instanceof Error ? error.message : '未知错误'
    );
    return false;
  }
}