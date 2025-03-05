import requests
from bs4 import BeautifulSoup
import time
import os
import concurrent.futures
import threading

# 添加一个锁用于线程安全的打印
print_lock = threading.Lock()

def safe_print(*args, **kwargs):
    """线程安全的打印函数"""
    with print_lock:
        print(*args, **kwargs)

def get_chapter_links(list_url):
    """获取章节链接列表"""
    response = requests.get(list_url)
    response.encoding = 'utf-8'
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 找到所有section-box元素
    section_boxes = soup.select('.section-box')
    
    chapter_links = []
    # 如果有至少两个section-box，使用第二个
    if len(section_boxes) >= 2:
        # 从第二个section-box中选择章节链接
        chapter_elements = section_boxes[1].select('.section-list.fix li a')
        
        for element in chapter_elements:
            href = element.get('href')
            if href:
                # 如果链接是相对路径，转为绝对路径
                if not href.startswith('http'):
                    if href.startswith('/'):
                        href = 'https://www.qizi.cc' + href
                    else:
                        href = 'https://www.qizi.cc/' + href
                chapter_links.append((element.text.strip(), href))
    else:
        safe_print(f"警告: 在页面中没有找到足够的section-box元素")
    
    return chapter_links

def get_chapter_content(chapter_info):
    """获取章节内容"""
    index, (chapter_title, url) = chapter_info
    try:
        response = requests.get(url)
        response.encoding = 'utf-8'
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 获取章节标题，使用更具体的选择器
        title = soup.select_one('.reader-main .title')
        if title:
            title = title.text.strip()
        else:
            # 如果找不到特定选择器，回退到一般的h1
            title = soup.select_one('h1')
            if title:
                title = title.text.strip()
            else:
                title = chapter_title  # 使用链接中的标题作为后备
        
        # 获取章节内容
        content_div = soup.select_one('#content')
        if not content_div:
            # 尝试其他可能的内容选择器
            content_div = soup.select_one('.content')
        
        if content_div:
            # 移除广告和其他不需要的元素
            for ad in content_div.select('.adsbygoogle, script, ins, iframe, .mobile-div'):
                ad.decompose()
            
            # 获取所有段落，但排除.mobile-div中的内容
            paragraphs = []
            for p in content_div.find_all('p'):
                # 检查该段落是否在.mobile-div中
                if not p.find_parent('.mobile-div'):
                    paragraphs.append(p.text.strip())
            
            # 将段落连接成完整内容
            content = '\n'.join(paragraphs)
        else:
            # 如果找不到内容div，尝试直接获取正文部分
            main_content = soup.select('p')
            content = '\n'.join([p.text.strip() for p in main_content if p.text.strip() and not p.find_parent('.mobile-div')])
        
        safe_print(f"  成功爬取: [{index}/{total_chapters}] {title}")
        return index, (title, content)
    except Exception as e:
        safe_print(f"  爬取失败: [{index}/{total_chapters}] {chapter_title}, 错误: {e}")
        return index, (chapter_title, f"爬取失败: {str(e)}")

def save_to_txt(title, chapters, output_file):
    """保存章节到txt文件"""
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(title + '\n\n')
        
        for chapter_title, chapter_content in chapters:
            f.write(f"{chapter_title}\n")
            f.write('='*50 + '\n\n')
            f.write(chapter_content + '\n\n')
            f.write('='*50 + '\n\n')

def crawl_novel():
    """爬取小说主函数"""
    global total_chapters
    
    # 小说基本信息
    novel_title = "悔婚当日，清冷权臣求我别始乱终弃"
    output_file = f"{novel_title}.txt"
    
    # 章节列表页面
    list_urls = [
        "https://www.qizi.cc/10031437/",
        "https://www.qizi.cc/10031437/2/"
    ]
    
    all_chapter_links = []
    
    # 获取所有章节链接
    for list_url in list_urls:
        chapter_links = get_chapter_links(list_url)
        all_chapter_links.extend(chapter_links)
        safe_print(f"从 {list_url} 获取到 {len(chapter_links)} 个章节链接")
        time.sleep(1)  # 避免请求过快
    
    # 按章节顺序排序
    all_chapter_links.sort(key=lambda x: int(''.join(filter(str.isdigit, x[0])) or '0'))
    
    # 设置全局变量，用于显示进度
    total_chapters = len(all_chapter_links)
    
    # 创建章节索引
    chapter_infos = [(i, chapter) for i, chapter in enumerate(all_chapter_links, 1)]
    
    # 使用线程池并发爬取章节内容
    safe_print(f"开始并发爬取 {total_chapters} 个章节...")
    results = []
    
    # 设置最大线程数，可以根据需要调整
    max_workers = 10
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 提交所有任务
        future_to_chapter = {executor.submit(get_chapter_content, chapter_info): chapter_info for chapter_info in chapter_infos}
        
        # 获取结果
        for future in concurrent.futures.as_completed(future_to_chapter):
            result = future.result()
            if result:
                results.append(result)
    
    # 按章节顺序排序结果
    results.sort(key=lambda x: x[0])
    chapters = [content for _, content in results]
    
    # 保存到txt文件
    save_to_txt(novel_title, chapters, output_file)
    safe_print(f"小说《{novel_title}》已保存到 {output_file}")

if __name__ == "__main__":
    crawl_novel()