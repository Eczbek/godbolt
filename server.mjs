import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { join, parse } from 'node:path';

createServer((req, res) => {
	const path = join('./', (req.url.split('?')[0] == '/') ? 'index.html' : (req.url.split('?')[0] + (parse(req.url).ext ? '' : '.html')));
	createReadStream(path)
		.on('error', () => res.writeHead(404).end())
		.on('open', function() {
			res.setHeader('Content-Type', {
				css: 'text/css',
				html: 'text/html',
				js: 'application/javascript',
				png: 'image/png'
			}[parse(path).ext.slice(1)]);
			this.pipe(res);
		});
}).listen(8029);
