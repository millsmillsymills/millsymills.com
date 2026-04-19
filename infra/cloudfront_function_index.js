function handler(event) {
  var req = event.request;
  var uri = req.uri;

  if (uri.endsWith('/')) {
    req.uri = uri + 'index.html';
  } else if (!uri.split('/').pop().includes('.')) {
    req.uri = uri + '/index.html';
  }

  return req;
}
