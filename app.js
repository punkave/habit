var fs = require('fs');
var _ = require('lodash');
var wrench = require('wrench');
var less = require('less');
var marked = require('marked');
var nunjucks = require('nunjucks');

nunjucks.configure('_layouts', { });

if (fs.existsSync('_site'))
{
  wrench.rmdirSyncRecursive('_site');
}

fs.mkdirSync('_site');

var filters = {
  'less': lessFilter,
  'md': markdownFilter
};

var browser = require('findit')('.');

browser.on('directory', function(dir, stat, stop) {
  if (ignored(dir)) {
    return;
  }
  if (!fs.existsSync('_site/' + dir)) {
    fs.mkdirSync('_site/' + dir);
  }
});

browser.on('file', function(file, stat) {
  // Ignore dotfiles and _ files
  if (ignored(file)) {
    return;
  }
  var matches = file.match(/\.(\w+)$/);
  if (matches) {
    extension = matches[1];
    // If there is a filter for this type, invoke that instead of copying
    if (_.has(filters, extension)) {
      filters[extension](file);
      return;
    }
  }
  // Everything else is simply copied
  writeToSite(file, fs.readFileSync(file));
});

function ignored(file) {
  // Ignore dotfolders and _ folders, like _site and _layouts
  if (file.match(/^(\.|_)/)) {
    return true;
  }
  if (file.match(/\/(\.|_)/)) {
    return true;
  }
  return false;
}

function writeToSite(name, data)
{
  fs.writeFileSync('_site/' + name, data);
}

// Filters for various extensions begin here

function lessFilter(file) {
  if (!file.match(/main\.less$/)) {
    // LESS files other than "main" are assumed to be imported
    // by main so we should not try to compile or copy them separately
    return;
  }
  less.render(fs.readFileSync(file, 'utf8'), { async: false }, function(e, css) {
    if (e) {
      throw e;
    }
    writeToSite(file.replace(/\.less$/, '.css'), css);
  });
}

function markdownFilter(file) {
  var html = marked(fs.readFileSync(file, 'utf8'));
  var layout = 'default';
  var matches = html.match(/<!---\s*layout:\s*(\w+)\s*-->/);
  if (matches) {
    layout = matches[1];
  }
  html = html.replace(/<!---\s*layout:\s*(\w+)\s*-->/, '');
  var title;
  matches = html.match(/<h1.*?>(.*)<\/h1\>/);
  if (matches) {
    title = matches[1];
    html = html.replace(/<h1.*?>(.*)<\/h1\>/, '');
  }
  var root = './';
  var clauses = file.split('/');
  var i;
  for (i = 1; (i < clauses.length); i++) {
    root += '../';
  }
  var rendered = nunjucks.render(layout + '.html', { content: html, title: title, root: root });
  var htmlFile = file.replace(/\.md$/, '.html');
  writeToSite(htmlFile, rendered);
}

