function handler(event) {
  var req = event.request;
  var uri = req.uri;

  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
  } else if (!uri.split('/').pop().includes('.')) {
    // Heuristic: a "." in the final path segment means we treat it as a
    // file (let it 404 cleanly if missing rather than rewriting). This is
    // not a parser — a path like /v1.2/index would be misclassified as a
    // file. None of the site's prerendered routes hit that pattern today,
    // so the heuristic is safe; if a future route shape needs literal dots
    // in directory segments, swap this for a known-extensions allowlist.
    req.uri = uri + '/index.html';
  }

  return req;
}
