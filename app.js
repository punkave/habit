var fs = require('fs');
var _ = require('lodash');
var wrench = require('wrench');
var less = require('less');
var mm = require('meta-marked');
var nunjucks = require('nunjucks');
var path = require('path');

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

var map = {};

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

browser.on('end', function() {
  // Sort the filenames so that parent folders come first.
  //
  // Create an array of children and a pointer to the parent
  // for each file.
  //
  // Order the arrays of children based on the "previous" property
  // of each child.
  //
  // Now we have metadata to build navigation.

  var keys = _.keys(map);

  keys.sort(function(a, b) {
    // Make sure index.md sorts to the top
    a = a.replace(/index\.md$/, '');
    b = b.replace(/index\.md$/, '');
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    } else {
      return 0;
    }
  });

  _.each(keys, function(key) {
    var parent = getParentKey(key);
    if (map[parent] && (parent !== key)) {
      map[parent].naturalChildren = (map[parent].naturalChildren || []);
      map[parent].naturalChildren.push(map[key]);
      map[key].parent = map[parent];
    }
  });

  _.each(keys, function(key) {
    var file = map[key];
    if (file.children) {
      var actualChildren = [];
      _.each(file.children, function(childShortName) {
        var winner = _.find(file.naturalChildren, function(child) {
          return (shortName(child.file) === childShortName);
        });
        if (!winner) {
          throw new Error(key + ' lists ' + childShortName + ' as one of its children but it does not exist');
        }
        actualChildren.push(winner);
      });
      file.children = actualChildren;

      previous = undefined;
      _.each(file.children, function(child) {
        child.previous = previous;
        previous = child;
      });

      next = undefined;
      var i;
      for (i = 0; (i < file.children.length - 1); i++) {
        file.children[i].next = file.children[i + 1];
      }
    }

    file.ancestors = [];
    var ancestor = file;
    while (ancestor) {
      file.ancestors.unshift(ancestor);
      ancestor = ancestor.parent;
    }
  });

  // The final rendering pass
  _.each(map, function(info, file) {
    var rendered = nunjucks.render(info.layout + '.html', info);
    var htmlFile = file.replace(/\.md$/, '.html');
    writeToSite(htmlFile, rendered);
  });
});

function shortName(file) {
  file = file.replace(/\/index\.md/, '');
  return path.basename(file, '.md');
}

function getParentKey(key) {
  key = key.replace(/\/index\.md$/, '');
  if (key.match(/\//)) {
    key = key.replace(/\/[^\/]+$/, '');
    key += '/index.md';
    return key;
  } else {
    return 'index.md';
  }
}

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

  var parser = new(less.Parser)({
    paths: [path.dirname(file)], // Specify search paths for @import directives
    filename: file // Specify a filename, for better error messages
  });

  parser.parse(fs.readFileSync(file, 'utf8'), function(e, tree) {
    if (e) {
      throw new Error(e);
    }
    writeToSite(file.replace(/\.less$/, '.css'), tree.toCSS());
  });
}

function markdownFilter(file) {
  var info = mm(fs.readFileSync(file, 'utf8'));
  var meta = info.meta || {};
  var html = info.html;
  meta.layout = meta.layout || 'default';
  var root = './';
  var clauses = file.split('/');
  var i;
  for (i = 1; (i < clauses.length); i++) {
    root += '../';
  }
  var data = meta;
  data.content = html;
  data.file = file;
  data.root = root;
  data.url = data.file.replace(/\.md/, '.html');
  // Don't write it now; we'll make another pass after
  // combining the metadata that builds our navigation
  map[file] = data;
}

