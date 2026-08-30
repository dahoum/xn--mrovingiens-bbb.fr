const fs = require('fs');
const path = require('path');

function markdownToHtml(markdown) {
  const lines = markdown.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      if (inList) {
        html += '</ul>\n';
        inList = false;
      }
      continue;
    }

    // Headings
    const h1 = trimmed.match(/^#\s+(.*)/);
    const h2 = trimmed.match(/^##\s+(.*)/);
    const h3 = trimmed.match(/^###\s+(.*)/);

    if (h1) {
      if (inList) html += '</ul>\n', inList = false;
      html += `<h1>${h1[1]}</h1>\n`;
      continue;
    }
    if (h2) {
      if (inList) html += '</ul>\n', inList = false;
      html += `<h2>${h2[1]}</h2>\n`;
      continue;
    }
    if (h3) {
      if (inList) html += '</ul>\n', inList = false;
      html += `<h3>${h3[1]}</h3>\n`;
      continue;
    }

    // Bullet lists
    const listMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      if (!inList) {
        html += '<ul>\n';
        inList = true;
      }
      let item = listMatch[1];
      item = item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      item = item.replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<li>${item}</li>\n`;
      continue;
    }

    if (inList) {
      html += '</ul>\n';
      inList = false;
    }

    // Paragraph with inline formatting
    let para = line;
    para = para.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    para = para.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html += `<p>${para}</p>\n`;
  }

  if (inList) html += '</ul>\n';
  return html.trim();
}

function parseMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---[\r\n]+(.*?)---[\r\n]+(.*)/s);

  if (!match) {
    throw new Error(`No frontmatter in ${filePath}`);
  }

  const frontmatter = match[1];
  const body = match[2].trim();
  const fm = {};

  frontmatter.split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*(.*)/);
    if (m) fm[m[1]] = m[2].trim();
  });

  if (!fm.category || !fm.title || !fm.image) {
    throw new Error(`Missing category, title, or image in ${filePath}`);
  }

  return {
    category: fm.category,
    title: fm.title,
    image: fm.image,
    body,
    filePath
  };
}

function generateCategoriesHtml(articles) {
  const byCategory = {};
  articles.forEach(a => {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });

  let html = '';
  for (const [category, list] of Object.entries(byCategory)) {
    html += `<section>\n<h2>${category}</h2>\n<ul>\n`;
    list.forEach(a => {
      const filename = path.basename(a.filePath, '.md') + '.html';
      html += `<li><a href="${filename}">${a.title}</a></li>\n`;
    });
    html += `</ul>\n</section>\n`;
  }
  return html;
}

function main() {
  const dir = __dirname;
  const contentDir = path.join(dir, 'content');
  const templatesDir = path.join(dir, 'templates');
  const buildDir = path.join(dir, 'public');

  // Ensure templates exist
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir);
    fs.writeFileSync(
      path.join(templatesDir, 'index.html'),
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>My Site</title>\n</head>\n<body>\n<script src="header.js"></script>\n<h1>Articles</h1>\n{{categories}}\n</body>\n</html>'
    );
    fs.writeFileSync(
      path.join(templatesDir, 'article.html'),
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>{{title}}</title>\n</head>\n<body>\n<script src="header.js"></script>\n<article>\n<h1>{{title}}</h1>\n<img src="{{image}}" alt="{{title}}">\n{{content}}\n</article>\n</body>\n</html>'
    );
    fs.writeFileSync(
      path.join(templatesDir, 'header.html'),
      '<style>\n  body { padding-top: 6em; padding-left: 1em; }\n  .logo-container { position: fixed; top: 1em; left: 1em; z-index: 1000; }\n  .logo-text { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: 2rem; position: relative; }\n  .logo-text::before { content: ""; position: absolute; top: 50%; left: 20%; width: 100%; height: 100%; background-color: yellow; z-index: -1; }\n</style>\n<div class="logo-container"><span class="logo-text">Brunehilde</span></div>\n'
    );
  }

  // Read all .md files
  const articles = [];
  function readFiles(d) {
    fs.readdirSync(d).forEach(f => {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) {
        readFiles(p);
      } else if (f.endsWith('.md')) {
        articles.push(parseMarkdown(p));
      }
    });
  }

  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir);
    console.log(`Created ${contentDir}/ — add your .md files here.`);
    return;
  }

  readFiles(contentDir);

  if (articles.length === 0) {
    console.log('No .md files found in content/');
    return;
  }

  // Clean public dir
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir);

  // Copy header.html to public dir
  const headerHtmlPath = path.join(templatesDir, 'header.html');
  if (fs.existsSync(headerHtmlPath)) {
    fs.copyFileSync(headerHtmlPath, path.join(buildDir, 'header.html'));
  }

  // Load templates
  const indexTpl = fs.readFileSync(path.join(templatesDir, 'index.html'), 'utf8');
  const articleTpl = fs.readFileSync(path.join(templatesDir, 'article.html'), 'utf8');

  // Generate index.html
  const categoriesHtml = generateCategoriesHtml(articles);
  fs.writeFileSync(
    path.join(buildDir, 'index.html'),
    indexTpl.replace('{{categories}}', categoriesHtml)
  );

  // Generate article pages
  articles.forEach(a => {
    const filename = path.basename(a.filePath, '.md') + '.html';
    let html = articleTpl
      .replace(/{{title}}/g, a.title)
      .replace(/{{image}}/g, a.image)
      .replace('{{content}}', markdownToHtml(a.body));
    fs.writeFileSync(path.join(buildDir, filename), html);
  });

  console.log(`Generated ${articles.length} article(s) in ${buildDir}/`);
}

main();
