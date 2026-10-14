import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/practice.js':'practice.js'};
const types = {html:'text/html',css:'text/css',js:'text/javascript'};
const server = http.createServer(async (req,res) => {
  const file = files[new URL(req.url,'http://localhost').pathname];
  if (!file) {res.writeHead(404);res.end('Not found');return;}
  try { const data = await readFile(new URL(file,import.meta.url)); res.writeHead(200,{'Content-Type':`${types[file.split('.').pop()]}; charset=utf-8`,'Cache-Control':'no-cache'});res.end(data); }
  catch {res.writeHead(500);res.end('Unable to load application');}
});
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '0.0.0.0',() => console.log('Say It Five server listening on port',server.address().port));
