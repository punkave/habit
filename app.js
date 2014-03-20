// These folders are copied directly to subdirs of the same name in the _site folder
var copyDirs = [ 'images', 'fonts' ];

var fs = require('fs');
var _ = require('lodash');
var wrench = require('wrench');
var less = require('less');
var marked = require('marked');
var nunjucks = require('nunjucks');

nunjucks.configure('layouts', { });

if (fs.existsSync('_site'))
{
  wrench.rmdirSyncRecursive('_site');
}

fs.mkdirSync('_site');

if (fs.existsSync('stylesheets/main.less'))
{
  // Not actually asynchronous
  less.render(fs.readFileSync('stylesheets/main.less', 'utf8'), { async: false }, function(e, css) {
    if (e) {
      throw e;
    }
    fs.mkdirSync('_site/stylesheets');
    fs.writeFileSync('_site/stylesheets/main.css', css);
  });
}

_.each(copyDirs, function(dir) {
  if (fs.existsSync(dir)) {
    wrench.copyDirSyncRecursive(dir, '_site/' + dir);
  }
});

var browser = require('findit')('.');

browser.on('directory', function(dir, stat, stop) {
  if (dir.match(/_site/)) {
    return;
  }
  if (!fs.existsSync('_site/' + dir)) {
    fs.mkdirSync('_site/' + dir);
  }
});

browser.on('file', function(file, stat) {
  if (file.match(/\.md$/))
  {
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
    fs.writeFileSync('_site/' + htmlFile, rendered);
  }
});
