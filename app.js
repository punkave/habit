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

// Custom renderer for headings. We don't want to make a nasty
// named anchor based on parameters in parentheses. But we do
// need to make sure we don't output the same named anchor twice
// if there are multiple syntaxes. So differentiate with
// numbers if needed.

function newRenderer() {
  var renderer = new mm.Renderer();
  renderer.slugsSeen = {};
  renderer.heading = function (text, level) {
    var slug = text.replace(/\(.*/, '');
    slug = cssName(slug);
    slug = slug.replace(/\-+/g, '-');
    slug = slug.replace(/^\-/, '');
    slug = slug.replace(/\-$/, '');

    if (renderer.slugsSeen[slug]) {
      renderer.slugsSeen[slug]++;
      slug += renderer.slugsSeen[slug];
    } else {
      renderer.slugsSeen[slug] = 1;
    }
    return '<h' + level + '><a name="' +
      slug +
       '" class="anchor" href="#' +
       slug +
       '"><span class="header-link"></span></a>' +
        text + '</h' + level + '>';
  };
  return renderer;
}

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
  // Set the "previous" and "next" properties of each page so
  // it is possible to walk through the entire site in a
  // depth-first traversal.
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
    }

    file.ancestors = [];
    var ancestor = file;
    while (ancestor) {
      file.ancestors.unshift(ancestor);
      ancestor = ancestor.parent;
    }
  });

  // Set up "previous" and "next" for each page so users can
  // walk through the entire site in a depth first traversal,
  // like reading through an outline

  var home = keys[0];
  var previous;
  if (home) {
    home = map[home];
    depthFirst(home);
  }

  function depthFirst(current) {
    current.previous = previous;
    if (previous) {
      previous.next = current;
    }
    previous = current;
    _.each(current.children, function(child) {
      depthFirst(child);
    });
  }

  // The final rendering pass
  _.each(map, function(info, file) {
    try {
      var rendered = nunjucks.render(info.layout + '.html', info);
    } catch (e) {
      console.error();
      console.error('A nunjucks error occurred while processing ' + file + ':\n');
      throw e;
    }
    var htmlFile = file.replace(/\.md$/, '.html');
    writeToSite(htmlFile, rendered);
  });

  // This should not be necessary, but when habit is run via a globally
  // installed "bin" script, it does not exit on completion without this
  // in node 0.12.7
  process.exit(0);

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
  if (file.match(/^node_modules\/?(.*)$/)) {
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
  var info;
  try {
    info = mm(fs.readFileSync(file, 'utf8'), { renderer: newRenderer() });
  } catch (e) {
    console.error('\nmarkdown error while processing ' + file);
    throw e;
  }
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

// Convert a string to look like a typical CSS
// class name, with hypens. Hi There becomes hi-there,
// hiThere also becomes hi-there, etc. Borrowed
// from Apostrophe.

function cssName(name) {
  var i;
  var css = '';
  var dash = false;
  for (i = 0; (i < name.length); i++) {
    var c = name.charAt(i);
    var lower = ((c >= 'a') && (c <= 'z'));
    var upper = ((c >= 'A') && (c <= 'Z'));
    var digit = ((c >= '0') && (c <= '9'));
    if (!(lower || upper || digit)) {
      dash = true;
      continue;
    }
    if (upper) {
      if (i > 0) {
        dash = true;
      }
      c = c.toLowerCase();
    }
    if (dash) {
      css += '-';
      dash = false;
    }
    css += c;
  }
  return css;
}
