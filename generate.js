const path = require('path');
const { generateSite } = require('generator.js');

generateSite({
  rootDir: __dirname,
  contentDir: path.join(__dirname, 'content'),
  templatesDir: path.join(__dirname, 'templates'),
  buildDir: path.join(__dirname, 'public'),
});
