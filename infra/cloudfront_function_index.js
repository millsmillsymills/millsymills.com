function handler(event) {
  var req = event.request;
  var uri = req.uri;

  // Framed deep-link: the bare /apps/<assetSlug> URL boots the desktop with
  // the demo window auto-opened, by 302-ing to the app's canonical permalink
  // (/unifi/ renders DesktopLayout with initialOpen). Only the bare path and
  // its trailing-slash form redirect -- /apps/unifi-demo/index.html must fall
  // through so the desktop window can iframe the raw asset (catching it here
  // would iframe the whole desktop into itself: infinite recursion).
  // One embedded demo today; promote to an assetSlug->appId table if more land.
  if (uri === '/apps/unifi-demo' || uri === '/apps/unifi-demo/') {
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: { location: { value: '/unifi/' } }
    };
  }

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
