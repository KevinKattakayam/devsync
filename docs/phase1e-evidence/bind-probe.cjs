const net = require('net');
Promise.all(['127.0.0.1', '0.0.0.0', '::1', '::'].map(host => new Promise(resolve => {
  const server = net.createServer();
  server.on('error', error => { console.log(JSON.stringify({ host, error: error.code })); resolve(); });
  server.listen(0, host, () => { console.log(JSON.stringify({ host, bind: 'ok' })); server.close(resolve); });
})));
