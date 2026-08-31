const fs = require('fs');
const path = require('path');

// Minimum recommended dimensions for social media cards
const MIN_IMAGE_WIDTH = 1200;
const MIN_IMAGE_HEIGHT = 627;

/**
 * Read image dimensions from file (JPEG and PNG)
 * Returns { width, height } or null if unable to read
 */
function getImageDimensions(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // Check JPEG (starts with 0xFFD8)
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      // Find SOF0 marker (0xFFC0)
      for (let i = 2; i < buffer.length - 8; i++) {
        if (buffer[i] === 0xFF && buffer[i + 1] === 0xC0) {
          // Height is at i+5, i+6 (big-endian)
          const height = (buffer[i + 5] << 8) | buffer[i + 6];
          // Width is at i+7, i+8 (big-endian)
          const width = (buffer[i + 7] << 8) | buffer[i + 8];
          return { width, height };
        }
      }
    }
    
    // Check PNG (starts with \x89PNG\r\n\x1a\n)
    if (buffer.length >= 24 && 
        buffer[0] === 0x89 && 
        buffer[1] === 0x50 && 
        buffer[2] === 0x4E && 
        buffer[3] === 0x47) {
      // IHDR chunk: bytes 16-23 are width (4 bytes big-endian) and height (4 bytes big-endian)
      const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
      const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
      return { width, height };
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

function markdownToHtml(markdown, outputDir) {
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

    // Images - validate and convert with correct paths
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imageMatch) {
      if (inList) html += '</ul>\n', inList = false;
      const alt = imageMatch[1];
      let src = imageMatch[2];
      
      // Image path in markdown is relative to the markdown file.
      // Images are copied to public/images/ with the same internal structure.
      // So images/foo.jpg in markdown becomes foo.jpg at the root of public/images/
      // Strip leading 'images/' if present to get the path within the images dir
      if (src.startsWith('images/')) {
        src = src.substring(7); // Remove 'images/' prefix
      }
      
      const imagesDir = path.join(path.dirname(outputDir), 'images');
      src = path.relative(outputDir, path.join(imagesDir, src));
      
      if (alt) {
        html += `<p><img src="${src}" alt="${alt}" class="article-inline-image"></p>\n`;
        html += `<p class="article-explanation">${alt}</p>\n`;
      } else {
        html += `<p><img src="${src}" alt="" class="article-inline-image"></p>\n`;
      }
      continue;
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
    filePath
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
    html += `<section>\n<h2>${category}</h2>\n<ul>\n`;
    list.forEach(a => {
      const articleDir = path.dirname(a.filePath);
      const parentDir = path.dirname(articleDir);
      const relativeDir = path.relative(contentDir, parentDir);
      const folderName = path.basename(articleDir);
      const filename = path.join(relativeDir, folderName + '.html');
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

  // Check templates exist
  const requiredTemplates = ['index.html', 'article.html', 'style.css'];
  for (const tpl of requiredTemplates) {
    const tplPath = path.join(templatesDir, tpl);
    if (!fs.existsSync(tplPath)) {
      console.error(`Error: Template '${tpl}' not found in ${templatesDir}/`);
      process.exit(1);
    }
  }

  // Read all .md files
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

  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir);
    console.log(`Created ${contentDir}/ — add your .md files here.`);
    return;
  }

  readFiles(contentDir);

  if (skippedFiles.length > 0) {
    console.log(`Skipped ${skippedFiles.length} file(s) without proper frontmatter:`);
    skippedFiles.forEach(f => console.log(`  - ${f}`));
  }

  if (articles.length === 0) {
    console.log('No .md files found in content/');
    return;
  }

  // Clean public dir
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir);

  // Copy style.css to public dir
  const styleCssPath = path.join(templatesDir, 'style.css');
  if (fs.existsSync(styleCssPath)) {
    fs.copyFileSync(styleCssPath, path.join(buildDir, 'style.css'));
  }

  // Load templates
  const indexTpl = fs.readFileSync(path.join(templatesDir, 'index.html'), 'utf8');
  const articleTpl = fs.readFileSync(path.join(templatesDir, 'article.html'), 'utf8');

  // Generate index.html
  const categoriesHtml = generateCategoriesHtml(articles, contentDir);
  fs.writeFileSync(
    path.join(buildDir, 'index.html'),
    indexTpl.replace('{{categories}}', categoriesHtml).replace('{{logoHref}}', 'index.html')
  );

  // Generate article pages
  articles.forEach(a => {
    const articleDir = path.dirname(a.filePath);
    const parentDir = path.dirname(articleDir);
    const relativeDir = path.relative(contentDir, parentDir);
    const outputDir = path.join(buildDir, relativeDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const folderName = path.basename(articleDir);
    const filename = path.join(outputDir, folderName + '.html');
    
    // Fix image path: frontmatter image is relative to markdown file,
    // but HTML needs path relative to output location
    const imageRelativeToOutput = path.relative(
      outputDir,
      path.join(buildDir, a.image)
    );
    
    // Compute logo href: relative path from article to index.html
    const logoHref = path.relative(outputDir, path.join(buildDir, 'index.html'));
    
    // Compute Open Graph / absolute paths (relative to site root)
    const articleRelativePath = path.relative(buildDir, filename);
    const ogUrl = '/' + articleRelativePath.replace(/\\/g, '/');
    const ogImage = '/' + path.relative(buildDir, path.join(buildDir, a.image)).replace(/\\/g, '/');
    
    // Get image dimensions and warn if too small for social cards
    const imageAbsPath = path.join(__dirname, 'content', path.dirname(path.relative(contentDir, a.filePath)), a.image);
    const dims = getImageDimensions(imageAbsPath);
    
    if (dims) {
      if (dims.width < MIN_IMAGE_WIDTH || dims.height < MIN_IMAGE_HEIGHT) {
        console.warn(`WARNING: Image '${a.image}' is too small for social media cards. ` +
                    `Recommended: at least ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}px. ` +
                    `Actual: ${dims.width}x${dims.height}px. ` +
                    `Article: ${a.title}`);
      }
    } else {
      console.warn(`WARNING: Could not read dimensions for image '${a.image}'. Article: ${a.title}`);
    }
    
    const ogImageWidth = dims ? dims.width : '';
    const ogImageHeight = dims ? dims.height : '';
    
    let html = articleTpl
      .replace(/{{title}}/g, a.title)
      .replace(/{{authors}}/g, a.authors)
      .replace(/{{image}}/g, imageRelativeToOutput)
      .replace(/{{explanation}}/g, a.explanation)
      .replace(/{{logoHref}}/g, logoHref)
      .replace(/{{ogImage}}/g, ogImage)
      .replace(/{{ogUrl}}/g, ogUrl)
      .replace(/{{ogImageWidth}}/g, ogImageWidth)
      .replace(/{{ogImageHeight}}/g, ogImageHeight)
      .replace('{{content}}', markdownToHtml(a.body, outputDir));
    fs.writeFileSync(filename, html);

    // Copy images from article's images folder to flat images dir
    const articleImagesDir = path.join(articleDir, 'images');
    if (fs.existsSync(articleImagesDir)) {
      const imagesDir = path.join(buildDir, 'images');
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }
      fs.cpSync(articleImagesDir, imagesDir, { recursive: true });
    }
  });

  console.log(`Generated ${articles.length} article(s) in ${buildDir}/`);
}

main();
