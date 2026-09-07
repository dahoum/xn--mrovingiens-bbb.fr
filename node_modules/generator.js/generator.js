const fs = require('fs');
const path = require('path');

// Minimum recommended dimensions for social media cards
const MIN_IMAGE_WIDTH = 1200;
const MIN_IMAGE_HEIGHT = 627;

function getImageDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);

    // Check JPEG (starts with 0xFFD8)
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      for (let i = 2; i < buffer.length - 8; i++) {
        if (buffer[i] === 0xFF && buffer[i + 1] === 0xC0) {
          const height = (buffer[i + 5] << 8) | buffer[i + 6];
          const width = (buffer[i + 7] << 8) | buffer[i + 8];
          return { width, height };
        }
      }
    }

    // Check PNG (starts with \x89PNG\r\n\x1a\n)
    if (
      buffer.length >= 24 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47
    ) {
      const width =
        (buffer[16] << 24) |
        (buffer[17] << 16) |
        (buffer[18] << 8) |
        buffer[19];
      const height =
        (buffer[20] << 24) |
        (buffer[21] << 16) |
        (buffer[22] << 8) |
        buffer[23];
      return { width, height };
    }

    return null;
  } catch (e) {
    return null;
  }
}

function markdownToHtml(markdown, outputDir, articleRelativePath) {
  const pdfsDir = path.join(path.dirname(outputDir), articleRelativePath, 'pdfs');
  const pdfsRelativePath = path.relative(outputDir, pdfsDir);

  const fixPdfLink = (match, text, href) => {
    if (href.startsWith('pdfs/')) {
      const filename = href.substring(5);
      const fixedHref = path.join(pdfsRelativePath, filename).split(path.sep).join('/');
      return `<a href="${fixedHref}">${text}</a>`;
    }
    return `<a href="${href}">${text}</a>`;
  };

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

    const h1 = trimmed.match(/^#\s+(.*)/);
    const h2 = trimmed.match(/^##\s+(.*)/);
    const h3 = trimmed.match(/^###\s+(.*)/);

    if (h1) {
      if (inList) html += '</ul>\n', (inList = false);
      html += `<h1>${h1[1]}</h1>\n`;
      continue;
    }
    if (h2) {
      if (inList) html += '</ul>\n', (inList = false);
      html += `<h2>${h2[1]}</h2>\n`;
      continue;
    }
    if (h3) {
      if (inList) html += '</ul>\n', (inList = false);
      html += `<h3>${h3[1]}</h3>\n`;
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      if (!inList) {
        html += '<ul>\n';
        inList = true;
      }
      let item = listMatch[1];
      item = item.replace(/__(.*?)__/g, '<strong>$1</strong>');
      item = item.replace(/_(.*?)_/g, '<em>$1</em>');
      item = item.replace(/\[([^\]]+)\]\(([^)]+)\)/g, fixPdfLink);
      html += `<li>${item}</li>\n`;
      continue;
    }

    if (inList) {
      html += '</ul>\n';
      inList = false;
    }

    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imageMatch) {
      const alt = imageMatch[1];
      let src = imageMatch[2];

      if (src.startsWith('images/')) {
        src = src.substring(7);
      }

      const articleImagesDir = path.join(path.dirname(outputDir), articleRelativePath, 'images');
      src = path.relative(outputDir, path.join(articleImagesDir, src));

      if (alt) {
        html += `<p><img src="${src}" alt="${alt}" class="article-inline-image"></p>\n`;
        html += `<p class="article-explanation">${alt}</p>\n`;
      } else {
        html += `<p><img src="${src}" alt="" class="article-inline-image"></p>\n`;
      }
      continue;
    }

    let para = line;
    para = para.replace(/__(.*?)__/g, '<strong>$1</strong>');
    para = para.replace(/_(.*?)_/g, '<em>$1</em>');
    para = para.replace(/\[([^\]]+)\]\(([^)]+)\)/g, fixPdfLink);
    html += `<p>${para}</p>\n`;
  }

  if (inList) html += '</ul>\n';
  return html.trim();
}

function parseMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---[\r\n]+(.*?)---[\r\n]+(.*)/s);

  if (!match) {
    return null;
  }

  const frontmatter = match[1];
  const body = match[2].trim();
  const fm = {};

  frontmatter.split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*(.*)/);
    if (m) fm[m[1]] = m[2].trim();
  });

  if (!fm.category || !fm.title || !fm.image) {
    return null;
  }

  return {
    category: fm.category,
    title: fm.title,
    authors: fm.authors || '',
    image: fm.image,
    explanation: fm.explanation || '',
    body,
    filePath,
  };
}

function generateCategoriesHtml(articles, contentDir) {
  const byCategory = {};
  articles.forEach(a => {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  });

  let html = '';
  for (const [category, list] of Object.entries(byCategory)) {
    html += `<section>\n<h2>${category}</h2>\n`;
    list.forEach(a => {
      const articleDir = path.dirname(a.filePath);
      const parentDir = path.dirname(articleDir);
      const relativeDir = path.relative(contentDir, parentDir);
      const folderName = path.basename(articleDir);
      const filename = path.join(relativeDir, folderName + '.html');
      html += `<p><a href="${filename}">${a.title}</a></p>\n`;
    });
    html += `</section>\n`;
  }
  return html;
}

function generateSite({
  rootDir = process.cwd(),
  contentDir = path.join(process.cwd(), 'content'),
  templatesDir = path.join(process.cwd(), 'templates'),
  buildDir = path.join(process.cwd(), 'public'),
} = {}) {
  const dir = rootDir;
  const siteContentDir = contentDir || path.join(dir, 'content');
  const siteTemplatesDir = templatesDir || path.join(dir, 'templates');
  const siteBuildDir = buildDir || path.join(dir, 'public');

  const requiredTemplates = ['index.html', 'article.html', 'style.css'];
  for (const tpl of requiredTemplates) {
    const tplPath = path.join(siteTemplatesDir, tpl);
    if (!fs.existsSync(tplPath)) {
      console.error(`Error: Template '${tpl}' not found in ${siteTemplatesDir}/`);
      process.exit(1);
    }
  }

  const articles = [];
  const skippedFiles = [];

  function readFiles(d) {
    fs.readdirSync(d).forEach(f => {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) {
        readFiles(p);
      } else if (f.endsWith('.md')) {
        const result = parseMarkdown(p);
        if (result) {
          articles.push(result);
        } else {
          skippedFiles.push(p);
        }
      }
    });
  }

  if (!fs.existsSync(siteContentDir)) {
    fs.mkdirSync(siteContentDir);
    console.log(`Created ${siteContentDir}/ — add your .md files here.`);
    return;
  }

  readFiles(siteContentDir);

  if (skippedFiles.length > 0) {
    console.log(`Skipped ${skippedFiles.length} file(s) without proper frontmatter:`);
    skippedFiles.forEach(f => console.log(`  - ${f}`));
  }

  if (articles.length === 0) {
    console.log('No .md files found in content/');
    return;
  }

  fs.rmSync(siteBuildDir, { recursive: true, force: true });
  fs.mkdirSync(siteBuildDir);

  const styleCssPath = path.join(siteTemplatesDir, 'style.css');
  if (fs.existsSync(styleCssPath)) {
    fs.copyFileSync(styleCssPath, path.join(siteBuildDir, 'style.css'));
  }

  const templatesImagesDir = path.join(siteTemplatesDir, 'images');
  const publicImagesDir = path.join(siteBuildDir, 'images');
  if (fs.existsSync(templatesImagesDir)) {
    fs.mkdirSync(publicImagesDir, { recursive: true });
    fs.cpSync(templatesImagesDir, publicImagesDir, { recursive: true });
  }

  const templatesIconsDir = path.join(siteTemplatesDir, 'icons');
  const publicIconsDir = path.join(siteBuildDir, 'icons');
  if (fs.existsSync(templatesIconsDir)) {
    fs.mkdirSync(publicIconsDir, { recursive: true });
    fs.cpSync(templatesIconsDir, publicIconsDir, { recursive: true });
  }

  const indexTpl = fs.readFileSync(path.join(siteTemplatesDir, 'index.html'), 'utf8');
  const articleTpl = fs.readFileSync(path.join(siteTemplatesDir, 'article.html'), 'utf8');

  const categoriesHtml = generateCategoriesHtml(articles, siteContentDir);
  
  let indexHtml = indexTpl.replace('{{categories}}', categoriesHtml).replace('{{logoHref}}', 'index.html');

  // Inject home article content if a "Home" category article exists
  const homeArticle = articles.find(a => a.category === 'Home');
  if (homeArticle) {
    const paragraphs = homeArticle.body.split('\n\n').filter(p => p.trim());
    const homeArticleRelativePath = path.relative(siteContentDir, path.dirname(homeArticle.filePath));
    const homeImagePath = path.join(siteBuildDir, homeArticleRelativePath, homeArticle.image);
    const homeImageRelative = path.relative(siteBuildDir, homeImagePath);
    indexHtml = indexHtml
      .replace('{{homeTitle}}', homeArticle.title)
      .replace('{{homeImage}}', homeImageRelative)
      .replace('{{homeParagraph1}}', paragraphs[0] || '')
      .replace('{{homeParagraph2}}', paragraphs[1] || '')
      .replace('{{homeParagraph3}}', paragraphs[2] || '')
      .replace('{{homeParagraph4}}', paragraphs[3] || '');
  }

  fs.writeFileSync(
    path.join(siteBuildDir, 'index.html'),
    indexHtml
  );

  articles.forEach(a => {
    const articleDir = path.dirname(a.filePath);
    const parentDir = path.dirname(articleDir);
    const relativeDir = path.relative(siteContentDir, parentDir);
    const outputDir = path.join(siteBuildDir, relativeDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const folderName = path.basename(articleDir);
    const filename = path.join(outputDir, folderName + '.html');

    const articleRelativePath = path.relative(siteContentDir, path.dirname(a.filePath));
    const imageRelativeToOutput = path.relative(
      outputDir,
      path.join(siteBuildDir, articleRelativePath, a.image)
    );

    const logoHref = path.relative(outputDir, path.join(siteBuildDir, 'index.html'));
    const articleRelativeToBuild = path.relative(siteBuildDir, filename);
    const ogUrl = '/' + articleRelativeToBuild.replace(/\\/g, '/');
    const ogImage =
      '/' +
      path
        .relative(siteBuildDir, path.join(siteBuildDir, articleRelativePath, a.image))
        .replace(/\\/g, '/');

    const imageAbsPath = path.join(dir, 'content', articleRelativePath, a.image);
    const dims = getImageDimensions(imageAbsPath);

    if (dims) {
      if (dims.width < MIN_IMAGE_WIDTH || dims.height < MIN_IMAGE_HEIGHT) {
        console.warn(
          `WARNING: Image '${a.image}' is too small for social media cards. ` +
            `Recommended: at least ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}px. ` +
            `Actual: ${dims.width}x${dims.height}px. ` +
            `Article: ${a.title}`
        );
      }
    } else {
      console.warn(`WARNING: Could not read dimensions for image '${a.image}'. Article: ${a.title}`);
    }

    const ogImageWidth = dims ? dims.width : '';
    const ogImageHeight = dims ? dims.height : '';

    const html = articleTpl
      .replace(/{{title}}/g, a.title)
      .replace(/{{authors}}/g, a.authors)
      .replace(/{{image}}/g, imageRelativeToOutput)
      .replace(/{{explanation}}/g, a.explanation)
      .replace(/{{logoHref}}/g, logoHref)
      .replace(/{{ogImage}}/g, ogImage)
      .replace(/{{ogUrl}}/g, ogUrl)
      .replace(/{{ogImageWidth}}/g, ogImageWidth)
      .replace(/{{ogImageHeight}}/g, ogImageHeight)
      .replace('{{content}}', markdownToHtml(a.body, outputDir, articleRelativePath));

    fs.writeFileSync(filename, html);

    const articleImagesDir = path.join(articleDir, 'images');
    const targetImagesDir = path.join(siteBuildDir, articleRelativePath, 'images');
    if (fs.existsSync(articleImagesDir)) {
      fs.mkdirSync(path.dirname(targetImagesDir), { recursive: true });
      fs.cpSync(articleImagesDir, targetImagesDir, { recursive: true });
    }

    const articlePdfsDir = path.join(articleDir, 'pdfs');
    const targetPdfsDir = path.join(siteBuildDir, articleRelativePath, 'pdfs');
    if (fs.existsSync(articlePdfsDir)) {
      fs.mkdirSync(path.dirname(targetPdfsDir), { recursive: true });
      fs.cpSync(articlePdfsDir, targetPdfsDir, { recursive: true });
    }
  });

  console.log(`Generated ${articles.length} article(s) in ${siteBuildDir}/`);
  return { articles, outputDir: siteBuildDir };
}

if (require.main === module) {
  generateSite({
    rootDir: process.cwd(),
    contentDir: path.join(process.cwd(), 'content'),
    templatesDir: path.join(process.cwd(), 'templates'),
    buildDir: path.join(process.cwd(), 'public'),
  });
}

module.exports = {
  generateSite,
  getImageDimensions,
  markdownToHtml,
  parseMarkdown,
};
