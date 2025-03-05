const Epub = require('epub-gen');

const options = {
    title: '我的电子书',
    author: '作者名称',
    publisher: '出版社名称',
    tocTitle: '我的电子书标题',
    appendChapterTitles: false,
    customHtmlTocTemplatePath: './toc.html',
    content: [
        {
            title: '第一章',
            data: '<h1>第一章标题</h1><p>这是第一章的内容...</p>'
        },
        {
            title: '第二章',
            data: '<h1>第二章标题</h1><p>这是第二章的内容...</p>'
        }
    ]
};

new Epub(options, './output.epub').promise
    .then(() => console.log('电子书生成成功！'))
    .catch(err => console.error('生成失败:', err));